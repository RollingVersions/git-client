import {concat, encode} from '@rollingversions/git-core';
import assertNever from 'assert-never';
import {createHash} from 'crypto';
import {Transform} from 'stream';
import {createInflate, Inflate} from 'zlib';
import applyDelta from './apply-delta';
import {GitObjectTypeID} from './types';

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
    // const digest = createHash('sha1');
    let version = 3;
    let entriesCount = 0;
    let entryIndex = 0;
    let offset = 0;
    let calls = 0;

    // parse step state
    let chunk: Buffer;
    let chunkOffset = 0;
    let currentCallback!: Callback;
    let currentParseStepStartingOffset = 0;
    let currentParseStepStartingState: State = state;

    // Entry State
    let currentEntryOffset = 0;
    let currentEntryType = 0;
    let currentEntrySize = 0;
    let currentEntryLeftShift = 0;
    let currentRefDeltaId = '';
    let currentOffsetDeltaId = 0;
    let inflateError: Error | null = null;
    let inflateInputBuffer!: Buffer[];
    let inflateOutputBuffer!: Buffer[];
    let inflate!: Inflate;

    const states = {
      PACK_WORD(cb: Callback) {
        if (chunk.length - chunkOffset < 4) return cb();

        const packfileHeader = chunk.readUInt32BE(chunkOffset);
        chunkOffset += 4;

        if (packfileHeader !== 0x5041434b) {
          throw new Error(
            'Invalid packfile header, packfiles should start with "PACK"',
          );
        }

        state = 'VERSION';
        cb();
      },
      VERSION(cb: Callback) {
        if (chunk.length - chunkOffset < 4) return cb();

        version = chunk.readUInt32BE(chunkOffset);
        chunkOffset += 4;

        if (version !== 2 && version !== 3) {
          throw new Error(
            'Invalid version number ' + version + ', expected 2 or 3',
          );
        }

        state = 'ENTRIES_COUNT';
        cb();
      },
      ENTRIES_COUNT(cb: Callback) {
        if (chunk.length - chunkOffset < 4) return cb();

        entriesCount = chunk.readUInt32BE(chunkOffset);
        chunkOffset += 4;

        if (entriesCount === 0) {
          state = 'CHECKSUM';
        } else {
          state = 'HEADER';
        }

        cb();
      },
      HEADER(cb: Callback) {
        if (chunk.length - chunkOffset < 1) return cb();

        if (entriesCount <= entryIndex) {
          state = 'CHECKSUM';
          return cb();
        }

        // Setup the inflate stream
        inflateError = null;
        inflateInputBuffer = [];
        inflateOutputBuffer = [];
        inflate = initializeInflateStream();

        currentEntryOffset = offset;

        const byte = chunk[chunkOffset];
        currentEntryType = (byte >> 4) & 0x7;
        currentEntrySize = byte & 0xf;
        currentEntryLeftShift = 4;

        chunkOffset++;

        if (byte & 0x80) {
          state = 'HEADER_EXTENSION';
        } else {
          state = getCurrentEntryBodyType(currentEntryType);
        }
        cb();
      },
      HEADER_EXTENSION(cb: Callback) {
        while (chunk.length > chunkOffset) {
          const byte = chunk[chunkOffset++];
          currentEntrySize |= (byte & 0x7f) << currentEntryLeftShift;
          currentEntryLeftShift += 7;
          if (!(byte & 0x80)) {
            state = getCurrentEntryBodyType(currentEntryType);
            return cb();
          }
        }
        cb();
      },
      OFS_DELTA(cb: Callback) {
        if (chunk.length - chunkOffset < 1) return cb();
        const byte = chunk[chunkOffset];
        currentOffsetDeltaId = byte & 0x7f;
        chunkOffset++;
        if (byte & 0x80) {
          state = 'OFS_DELTA_EXTENSION';
        } else {
          state = 'RAW_BODY';
        }
        cb();
      },
      OFS_DELTA_EXTENSION(cb: Callback) {
        while (chunk.length > chunkOffset) {
          const byte = chunk[chunkOffset++];
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
        if (chunk.length - chunkOffset < 20) return cb();
        currentRefDeltaId = chunk.slice(0, 20).toString('hex');
        chunkOffset += 20;
      },
      RAW_BODY(cb: Callback) {
        if (inflateError) throw inflateError;
        const c = chunk.slice(chunkOffset);
        console.log(c.length, chunkOffset, chunk.length);
        chunkOffset = chunk.length;
        inflateInputBuffer.push(c);
        inflate.write(c, cb);
      },
      BODY_END(cb: Callback) {
        const outputBuffer = Buffer.concat(inflateOutputBuffer);
        if (outputBuffer.length !== currentEntrySize) {
          throw new Error(
            `Length mismatch, expected ${currentEntrySize} got ${outputBuffer.length}`,
          );
        }

        const inputBuffer = Buffer.concat(inflateInputBuffer);
        // TODO: digest?
        // digest.update(inputBuffer.slice(0, inflate.bytesWritten));
        const remaining = inputBuffer.slice(inflate.bytesWritten);
        chunkOffset = 0;
        chunk = remaining;

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
        state = 'HEADER';
        cb();
      },
      CHECKSUM(cb: Callback) {
        // TODO: validate checksum
        cb();
      },
    };

    type State = keyof typeof states;

    super({
      readableObjectMode: true,
      transform(rawChunk, _, callback) {
        calls++;
        if (calls > 1) {
          throw new Error(`concurrent calls encountered`);
        }
        currentCallback = callback;
        chunk = chunk ? Buffer.concat([chunk, rawChunk]) : rawChunk;
        parseStep();
      },
      flush(callback) {
        calls++;
        if (calls > 1) {
          throw new Error(`concurrent calls encountered`);
        }
        // TODO: handle possibility that state is ok
        callback(new Error(`Unexpected end of stream`));
      },
    });

    const push = (entry: any) => this.push(entry);

    function initializeInflateStream() {
      const stream = createInflate();
      stream
        .on(`data`, (chunk) => {
          if (!calls) {
            console.warn(`🚨 no active call`);
          }
          inflateOutputBuffer.push(chunk);
        })
        .on('error', (err) => {
          if (!calls) {
            console.warn(`🚨 no active call`);
          }
          inflateError = err;
          console.error(err.stack);
        })
        .on('end', () => {
          if (!calls) {
            console.warn(`🚨 no active call`);
          }
          state = 'BODY_END';
        });
      return stream;
    }

    function parseStep() {
      console.log(state);
      currentParseStepStartingOffset = chunkOffset;
      currentParseStepStartingState = state;
      try {
        states[state](parseStepCallback);
      } catch (ex) {
        parseStepCallback(ex as any);
      }
    }

    function parseStepCallback(err?: Error | null | undefined) {
      if (err) {
        calls--;
        currentCallback(err);
        return;
      }

      if (
        currentParseStepStartingOffset === chunkOffset &&
        currentParseStepStartingState === state
      ) {
        // No data was consumed, we must be waiting for more data
        calls--;
        currentCallback();
        return;
      }

      if (chunkOffset >= chunk.length) {
        // The entire chunk has been consumed
        // TODO: update the digest
        chunkOffset = 0;
        chunk = undefined as any;
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
