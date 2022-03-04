import {concat, encode} from '@rollingversions/git-core';
import {createHash} from 'crypto';
import {Transform} from 'stream';
import {createInflate} from 'zlib';
import applyDelta from './apply-delta';
import {GitObjectTypeID} from './types';

const INT32_BYTES = 4;

export interface Store<TKey, TValue> {
  get(key: TKey): TValue | undefined | Promise<TValue | undefined>;
  set(key: TKey, value: TValue): unknown;
}
export interface Stores {
  // Ideally you would provide a store that supports thinpack lookup
  // in addition to refs added via `.set`
  readonly references?: Store<string, {type: number; body: Buffer}>;
  readonly offsets?: Store<number, {type: number; body: Buffer}>;
}

export default class PackfileParserStream extends Transform {
  constructor(stores?: Stores) {
    const buffer: Buffer[] = [];
    super({
      readableObjectMode: true,
      transform(chunk, _, cb) {
        buffer.push(chunk);
        cb();
      },
      flush(cb) {
        parsePackfile(
          Buffer.concat(buffer),
          (entry) => this.push(entry),
          stores,
        ).then(
          () => cb(),
          (err) => cb(err),
        );
      },
    });
  }
}

export async function parsePackfile(
  data: Buffer,
  push: (entry: any) => void,
  {references = new Map(), offsets = new Map()}: Stores = {},
) {
  const buffer = createBuffer(data);

  // The first four bytes in a packfile are the bytes 'PACK'
  const packfileHeader = buffer.consumeUInt32BE();
  if (packfileHeader !== 0x5041434b) {
    throw new Error(
      'Invalid packfile header, packfiles should start with "PACK"',
    );
  }

  // The version is stored as an unsigned 32 integer in network byte order.
  // It must be version 2 or 3.
  const version = buffer.consumeUInt32BE();
  if (version !== 2 && version !== 3) {
    throw new Error('Invalid version number ' + version + ', expected 2 or 3');
  }

  // The number of objects in this packfile is also stored as an unsigned 32 bit int.
  const entriesCount = buffer.consumeUInt32BE();

  for (let entryIndex = 0; entryIndex < entriesCount; entryIndex++) {
    const entryOffset = buffer.getOffset();
    const {type, size} = parseHeader();
    switch (type) {
      case 6: {
        // OFFSET DELTA
        const delta = parseOffsetDelta();
        const rawBody = await parseBody(size);
        const base = await offsets.get(entryOffset - delta);
        if (!base) {
          throw new Error(
            `Cannot find base of ofs-delta ${entryOffset} - ${delta}`,
          );
        }
        const body = applyDelta(rawBody, base.body);
        onEntry({type: base.type, body}, entryOffset);
        break;
      }
      case 7: {
        // REF DELTA
        const ref = buffer.consumeBytes(20).toString('hex');
        const rawBody = await parseBody(size);
        const base = await references.get(ref);
        if (!base) {
          throw new Error(`Cannot find base of ref ${ref}`);
        }
        const body = applyDelta(rawBody, base.body);
        onEntry({type: base.type, body}, entryOffset);
        break;
      }
      default: {
        const rawBody = await parseBody(size);
        onEntry({type, body: rawBody}, entryOffset);
        break;
      }
    }
    // checkExpected();
  }

  const actualChecksum = createHash('sha1')
    .update(buffer.readConsumed())
    .digest('hex');
  const expectedChecksum = buffer.consumeBytes(20).toString('hex');
  if (actualChecksum !== expectedChecksum) {
    throw new Error(
      `Incorrect checksum, expected ${expectedChecksum} but got ${actualChecksum}`,
    );
  }
  if (buffer.getLength()) {
    throw new Error(`Expected end of stream`);
  }

  function parseHeader() {
    let byte = buffer.consumeByte();

    const type = (byte >> 4) & 0x7;
    let size = byte & 0xf;
    let leftShift = 4;

    while (byte & 0x80) {
      byte = buffer.consumeByte();
      size |= (byte & 0x7f) << leftShift;
      leftShift += 7;
    }
    return {type, size};
  }

  function parseOffsetDelta() {
    let byte = buffer.consumeByte();

    let offsetDelta = byte & 0x7f;

    while (byte & 0x80) {
      byte = buffer.consumeByte();
      offsetDelta = ((offsetDelta + 1) << 7) | (byte & 0x7f);
    }

    return offsetDelta;
  }

  async function parseBody(expectedSize: number) {
    const {output, bytesWritten} = await inflateAsync(buffer.readRemaining());
    buffer.consume(bytesWritten);
    if (output.length !== expectedSize) {
      throw new Error(`Size mismatch`);
    }
    return output;
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

function encodeRaw(type: string, bytes: Uint8Array) {
  return concat(encode(`${type} ${bytes.length}\0`), bytes);
}

function createBuffer(buffer: Buffer) {
  let bufferOffset = 0;

  function getLength() {
    return buffer.length - bufferOffset;
  }
  function getOffset() {
    return bufferOffset;
  }

  function consumeByte() {
    if (bufferOffset >= buffer.length) {
      throw new Error(`Unexpected end of input`);
    }
    const result = buffer[bufferOffset];
    consume(1);
    return result;
  }

  function consumeUInt32BE(): number {
    if (bufferOffset + INT32_BYTES > buffer.length) {
      throw new Error(`Unexpected end of input`);
    }

    const result = buffer.readUInt32BE(bufferOffset);

    consume(INT32_BYTES);
    return result;
  }

  function consumeBytes(bytes: number): Buffer {
    const result = buffer.slice(bufferOffset, bufferOffset + bytes);
    consume(bytes);
    return result;
  }

  function readConsumed(): Buffer {
    return buffer.slice(0, bufferOffset);
  }
  function readRemaining(): Buffer {
    return buffer.slice(bufferOffset);
  }

  function consume(bytes: number) {
    if (bufferOffset + bytes > buffer.length) {
      throw new Error(
        `There are not enough bytes in the buffer to consume ${bytes} bytes.`,
      );
    }
    bufferOffset += bytes;
  }

  return {
    getLength,
    getOffset,
    readConsumed,
    readRemaining,
    consumeByte,
    consumeUInt32BE,
    consumeBytes,
    consume,
  };
}

function inflateAsync(buffer: Buffer) {
  return new Promise<{output: Buffer; bytesWritten: number}>(
    (resolve, reject) => {
      const inflate = createInflate();
      const output: Buffer[] = [];
      inflate.on(`data`, (chunk) => output.push(chunk));
      inflate.on(`error`, reject);
      inflate.on(`end`, () => {
        resolve({
          output: Buffer.concat(output),
          bytesWritten: inflate.bytesWritten,
        });
      });
      inflate.end(buffer);
    },
  );
}
