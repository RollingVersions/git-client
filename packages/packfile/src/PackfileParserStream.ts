import {concat, encode} from '@rollingversions/git-core';
import assertNever from 'assert-never';
import {createHash} from 'crypto';
import {Transform} from 'stream';
import {createInflate, Inflate} from 'zlib';
import applyDelta from './apply-delta';
import {GitObjectTypeID} from './types';

const START = Date.now();

const expectedTypes = require('fs')
  .readFileSync(`fetch-response-types.txt`, `utf8`)
  .split(`\n`);

const INT32_BYTES = 4;

// The first four bytes in a packfile are the bytes 'PACK'

// The version is stored as an unsigned 32 integer in network byte order.
// It must be version 2 or 3.

// The number of objects in this packfile is also stored as an unsigned 32 bit int.

type Callback = (err?: Error | null | undefined) => void;

export interface Store<TKey, TValue> {
  // TODO: allow `get` to return a Promise
  get(key: TKey): TValue | undefined;
  set(key: TKey, value: TValue): unknown;
}
export interface Stores {
  // Ideally you would provide a store that supports thinpack lookup
  // in addition to refs added via `.set`
  readonly references?: Store<string, {type: number; body: Buffer}>;
  readonly offsets?: Store<number, {type: number; body: Buffer}>;
}

enum EntryType {
  OFS_DELTA = 'OFS_DELTA',
  REF_DELTA = 'REF_DELTA',
  RAW_BODY = 'RAW_BODY',
}
export default class PackfileParserStream extends Transform {
  constructor({references = new Map(), offsets = new Map()}: Stores = {}) {
    // Global State
    let state: State = 'PACK_WORD';
    const buffer = createBuffer();
    // const digest = createHash('sha1');
    let version = 3;
    let entriesCount = 0;
    let entryIndex = 0;
    let calls = 0;

    // parse step state
    let currentCallback!: Callback;
    let currentParseStepStartingState: State = state;

    // Entry State
    let currentEntryOffset = 0;
    let currentEntryType = 0;
    let currentEntrySize = 0;
    let currentEntryLeftShift = 0;
    let currentRefDeltaId = '';
    let currentOffsetDeltaId = 0;
    let inflateError: Error | null = null;
    let inflateBytesWritten = 0;
    let inflateOutputBuffer!: Buffer[];
    let inflate!: Inflate;

    let currentInflateStreamCallback: Callback | undefined;
    let inflateHappened = {resume: true, event: true};

    let streamEnded = false;

    const checkExpected = () => {
      const expected = JSON.parse(expectedTypes[entryIndex]);
      if (
        expected.type !== currentEntryType ||
        expected.entryOffset !== currentEntryOffset ||
        expected.size !== currentEntrySize
      ) {
        console.log(`expected = `, expected);
        console.log(`actual = `, {
          type: currentEntryType,
          entryOffset: currentEntryOffset,
          size: currentEntrySize,
        });
      } else {
        console.log(`✅`);
      }
    };
    const states = {
      PACK_WORD(cb: Callback) {
        if (buffer.getLength() < INT32_BYTES) return cb();

        const packfileHeader = buffer.consumeUInt32BE();

        if (packfileHeader !== 0x5041434b) {
          throw new Error(
            'Invalid packfile header, packfiles should start with "PACK"',
          );
        }

        state = 'VERSION';
        cb();
      },
      VERSION(cb: Callback) {
        if (buffer.getLength() < INT32_BYTES) return cb();

        version = buffer.consumeUInt32BE();

        if (version !== 2 && version !== 3) {
          throw new Error(
            'Invalid version number ' + version + ', expected 2 or 3',
          );
        }

        state = 'ENTRIES_COUNT';
        cb();
      },
      ENTRIES_COUNT(cb: Callback) {
        if (buffer.getLength() < INT32_BYTES) return cb();

        entriesCount = buffer.consumeUInt32BE();

        if (entriesCount === 0) {
          state = 'CHECKSUM';
        } else {
          state = 'HEADER';
        }

        cb();
      },
      HEADER(cb: Callback) {
        if (!buffer.getLength()) return cb();

        if (entriesCount <= entryIndex) {
          state = 'CHECKSUM';
          return cb();
        }

        // Setup the inflate stream
        inflateError = null;
        inflateBytesWritten = 0;
        inflateOutputBuffer = [];
        inflate = initializeInflateStream();

        currentEntryOffset = buffer.getOffset();

        const byte = buffer.consumeByte();
        currentEntryType = (byte >> 4) & 0x7;
        currentEntrySize = byte & 0xf;
        currentEntryLeftShift = 4;

        if (byte & 0x80) {
          state = 'HEADER_EXTENSION';
        } else {
          state = getCurrentEntryBodyType(currentEntryType);
          checkExpected();
        }
        cb();
      },
      HEADER_EXTENSION(cb: Callback) {
        while (buffer.getLength()) {
          const byte = buffer.consumeByte();
          currentEntrySize |= (byte & 0x7f) << currentEntryLeftShift;
          currentEntryLeftShift += 7;
          if (!(byte & 0x80)) {
            state = getCurrentEntryBodyType(currentEntryType);
            checkExpected();
            break;
          }
        }
        cb();
      },
      OFS_DELTA(cb: Callback) {
        if (buffer.getLength()) return cb();
        const byte = buffer.consumeByte();
        currentOffsetDeltaId = byte & 0x7f;
        if (byte & 0x80) {
          state = 'OFS_DELTA_EXTENSION';
        } else {
          state = 'RAW_BODY';
        }
        cb();
      },
      OFS_DELTA_EXTENSION(cb: Callback) {
        while (buffer.getLength()) {
          const byte = buffer.consumeByte();
          currentOffsetDeltaId =
            ((currentOffsetDeltaId + 1) << 7) | (byte & 0x7f);
          if (!(byte & 0x80)) {
            state = 'RAW_BODY';
            return cb();
          }
        }
        cb();
      },
      REF_DELTA(cb: Callback) {
        if (buffer.getLength() < 20) return cb();
        currentRefDeltaId = buffer.readMax().slice(0, 20).toString('hex');
        buffer.consume(20);
        state = 'RAW_BODY';
        cb();
      },
      RAW_BODY(cb: Callback) {
        if (inflateError) throw inflateError;
        const chunk = buffer.readMax();
        inflateBytesWritten += chunk.length;
        buffer.consume(chunk.length);

        inflateHappened = {resume: false, event: false};
        currentInflateStreamCallback = cb;
        if (streamEnded) {
          inflate.end(chunk);
        } else {
          inflate.write(chunk, onInflateWrite);
        }
        // const writeBufferLength = inflateBytesWritten - inflate.bytesWritten;

        // console.log(`🚨 ${Date.now() - START} add callback`);
        // currentInflateStreamCallback = (err) => {
        //   console.log(`✅ ${Date.now() - START} event`);
        //   cb(err);
        // };
        // console.log(`⭐ ${Date.now() - START} writing`);
        // inflate.write(chunk, (err) => {
        //   console.log(`⭐ ${Date.now() - START} cb`);
        //   if (err) return cb(err);
        //   // if (writeBufferLength > 256 * 1_024) {
        //   // } else {
        //   //   cb();
        //   // }
        // });
        // console.log(`⭐ ${Date.now() - START} written`);
      },
      BODY_END(cb: Callback) {
        const outputBuffer = Buffer.concat(inflateOutputBuffer);
        if (outputBuffer.length !== currentEntrySize) {
          throw new Error(
            `Length mismatch, expected ${currentEntrySize} got ${outputBuffer.length}`,
          );
        }

        console.log(`inflateBytesWritten=`, inflateBytesWritten);
        // TODO: digest?
        // digest.update(inputBuffer.slice(0, inflate.bytesWritten));
        buffer.unConsume(inflateBytesWritten - inflate.bytesWritten);

        const entryBodyType = getCurrentEntryBodyType(currentEntryType);
        const rawBody = Buffer.concat(inflateOutputBuffer);
        switch (entryBodyType) {
          case EntryType.OFS_DELTA: {
            const base = offsets.get(currentEntryOffset - currentOffsetDeltaId);
            if (!base) {
              throw new Error(
                `Cannot find base of ofs-delta ${currentEntryOffset} - ${currentOffsetDeltaId}`,
              );
            }
            const body = applyDelta(rawBody, base.body);
            onEntry({type: base.type, body}, currentEntryOffset);
            break;
          }
          case EntryType.REF_DELTA: {
            const base = references.get(currentRefDeltaId);
            if (!base) {
              throw new Error(
                `Cannot find base of ref-delta: ${currentRefDeltaId}`,
              );
            }
            const body = applyDelta(rawBody, base.body);
            onEntry({type: base.type, body}, currentEntryOffset);
            break;
          }
          case EntryType.RAW_BODY:
            onEntry(
              {type: currentEntryType, body: rawBody},
              currentEntryOffset,
            );
            break;
          default:
            assertNever(entryBodyType);
        }

        entryIndex++;
        state = 'HEADER';
        cb();
      },
      CHECKSUM(cb: Callback) {
        if (buffer.getLength() < 20) return cb();
        const checksum = buffer.readMax().slice(0, 20).toString('hex');
        console.info(`Expected checksum ${checksum}`);
        // TODO: validate checksum
        cb();
      },
    };

    type State = keyof typeof states;

    super({
      readableObjectMode: true,
      transform(chunk, _, callback) {
        calls++;
        if (calls > 1) {
          throw new Error(`concurrent calls encountered`);
        }
        currentCallback = callback;
        buffer.push(chunk);
        parseStep();
      },
      flush(callback) {
        calls++;
        if (calls > 1) {
          throw new Error(`concurrent calls encountered`);
        }
        currentCallback = callback;
        parseStep();
        // // TODO: handle possibility that state is ok
        // callback(new Error(`Unexpected end of stream`));
      },
    });

    const push = (entry: any) => this.push(entry);

    function initializeInflateStream() {
      const stream = createInflate();
      stream
        .on(`data`, (chunk) => {
          inflateOutputBuffer.push(chunk);
          console.log(`⭐ ${Date.now() - START} data`);
          onInflateEvent();
        })
        .on('error', (err) => {
          console.log(`⭐ ${Date.now() - START} error`);
          inflateError = err;
          if (streamEnded && currentInflateStreamCallback) {
            const cb = currentInflateStreamCallback;
            currentInflateStreamCallback = undefined;
            cb();
          } else {
            onInflateEvent(err);
          }
        })
        .on('end', () => {
          console.log(`⭐ ${Date.now() - START} end`);
          state = 'BODY_END';
          if (streamEnded && currentInflateStreamCallback) {
            const cb = currentInflateStreamCallback;
            currentInflateStreamCallback = undefined;
            cb();
          } else {
            onInflateEvent();
          }
        });
      return stream;
    }
    function onInflateEvent(err?: Error | null | undefined) {
      inflateHappened.event = true;
      if (
        !streamEnded &&
        (inflateHappened.resume || err) &&
        currentInflateStreamCallback
      ) {
        const cb = currentInflateStreamCallback;
        currentInflateStreamCallback = undefined;
        cb(err);
      }
    }
    function onInflateWrite(err?: Error | null | undefined) {
      console.log(`⭐ ${Date.now() - START} resume`);
      inflateHappened.resume = true;
      if (
        !streamEnded &&
        (inflateHappened.event || err) &&
        currentInflateStreamCallback
      ) {
        const cb = currentInflateStreamCallback;
        currentInflateStreamCallback = undefined;
        cb(err);
      }
    }

    function parseStep() {
      console.log(state);
      currentParseStepStartingState = state;
      try {
        states[state](parseStepCallback);
      } catch (ex) {
        parseStepCallback(ex as any);
      }
    }

    function parseStepCallback(err?: Error | null | undefined) {
      if (state === 'HEADER') {
        buffer.trim();
      }
      if (err) {
        calls--;
        currentCallback(err);
        return;
      }

      if (currentParseStepStartingState === state) {
        // If there were no state changes, we must be waiting for more data
        calls--;
        currentCallback();
        return;
      }

      if (!buffer.getLength()) {
        // The entire chunk has been consumed
        // TODO: update the digest
        calls--;
        currentCallback();
        return;
      }

      // Some data was consumed but more is available
      parseStep();
    }

    function onEntry(entry: {type: number; body: Buffer}, offset: number) {
      const type = GitObjectTypeID[entry.type] ?? `unknown`;
      const body = encodeRaw(type, entry.body);
      const hash = createHash('sha1').update(body).digest('hex');

      references.set(hash, entry);
      offsets.set(offset, entry);

      push({
        hash,
        type,
        body,
      });
    }
  }
}

function getCurrentEntryBodyType(typeId: number) {
  switch (typeId) {
    case 6:
      return EntryType.OFS_DELTA;
    case 7:
      return EntryType.REF_DELTA;
    default:
      return EntryType.RAW_BODY;
  }
}

function encodeRaw(type: string, bytes: Uint8Array) {
  return concat(encode(`${type} ${bytes.length}\0`), bytes);
}

function createBuffer() {
  let trimmedBytesCount = 0;
  let bufferOffset = 0;
  let bufferLength = 0;
  let buffer: Buffer[] = [];

  function push(chunk: Buffer) {
    console.log(`🔼 push(${chunk.length})`);
    buffer.push(chunk);
    bufferLength += chunk.length;
  }

  function getLength() {
    return bufferLength - bufferOffset;
  }
  function getOffset() {
    return trimmedBytesCount + bufferOffset;
  }

  function readByte(index: number) {
    let i = index + bufferOffset;
    for (const chunk of buffer) {
      if (i < chunk.length) {
        return chunk[i];
      } else {
        i -= chunk.length;
      }
    }
    throw new Error(`${index} out of range for buffer`);
  }
  function consumeByte() {
    const result = readByte(0);
    consume(1);
    return result;
  }

  function readUInt32BE(index: number): number {
    if (buffer.length > 1) {
      console.warn(`🚨 concatenating buffers for readUInt32BE`);
      buffer = [Buffer.concat(buffer)];
    }
    let i = index + bufferOffset;
    if (i + INT32_BYTES > bufferLength) {
      throw new Error(`${index} + INT32_BYTES out of range for buffer`);
    }
    for (const chunk of buffer) {
      if (i < chunk.length) {
        // if (i + INT32_BYTES <= chunk.length) {
        return chunk.readUInt32BE(i);
        // } else {
        //   console.warn(`🚨 concatenating buffers`);
        //   buffer = [Buffer.concat(buffer)];
        //   return readUInt32BE(index);
        // }
      } else {
        i -= chunk.length;
      }
    }
    throw new Error(`${index} out of range for buffer`);
  }
  function consumeUInt32BE() {
    const result = readUInt32BE(0);
    consume(4);
    return result;
  }

  function readMax(): Buffer {
    const newBuffer = [];
    let remainingOffset = bufferOffset;
    for (const chunk of buffer) {
      if (chunk.length <= remainingOffset) {
        remainingOffset -= chunk.length;
      } else if (remainingOffset) {
        newBuffer.push(chunk.slice(remainingOffset));
        remainingOffset = 0;
      } else {
        newBuffer.push(chunk);
      }
    }
    if (newBuffer.length > 1) {
      console.warn(`🚨 concatenating buffers for readMax`);
    }
    return Buffer.concat(newBuffer);
  }

  function consume(bytes: number) {
    console.log(`🔽 consume(${bytes})`);
    if (bufferOffset + bytes > bufferLength) {
      throw new Error(
        `There are not enough bytes in the buffer to consume ${bytes} bytes.`,
      );
    }
    bufferOffset += bytes;
  }

  function unConsume(bytes: number) {
    console.log(`🔼 unConsume(${bytes})`);
    if (bytes > bufferOffset) {
      throw new Error(
        `There are not enough bytes in the offset to un-consume ${bytes} bytes. You can only un-consume ${bufferOffset} bytes.`,
      );
    }
    bufferOffset -= bytes;
  }

  function trim() {
    trimmedBytesCount += bufferOffset;
    const newBuffer = [];
    for (const chunk of buffer) {
      if (chunk.length <= bufferOffset) {
        bufferOffset -= chunk.length;
      } else if (bufferOffset) {
        newBuffer.push(chunk.slice(bufferOffset));
        bufferOffset = 0;
      } else {
        newBuffer.push(chunk);
      }
    }
    buffer = newBuffer;
  }

  return {
    push,
    getLength,
    getOffset,
    readByte,
    consumeByte,
    readUInt32BE,
    consumeUInt32BE,
    readMax,
    consume,
    unConsume,
    trim,
  };
}
