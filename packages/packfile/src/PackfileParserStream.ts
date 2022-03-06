import {createHash} from 'crypto';
import {Duplex} from 'stream';
import {createInflate, inflate} from 'zlib';
import applyDelta from './apply-delta';
import {GitObjectType, GitObjectTypeID, GitRawObject} from './types';

const INT32_BYTES = 4;

export enum StoredEntryKind {
  normal = 1,
  ref = 2,
  offset = 3,
}

export type EntryData =
  | {
      readonly kind: StoredEntryKind.normal;
      readonly type: number;
      readonly body: {compressed: Buffer; uncompressed: Buffer};
    }
  | {
      readonly kind: StoredEntryKind.ref;
      readonly ref: string;
      readonly body: {compressed: Buffer; uncompressed: Buffer};
    }
  | {
      readonly kind: StoredEntryKind.offset;
      readonly referencedOffset: number;
      readonly body: {compressed: Buffer; uncompressed: Buffer};
    };

export type StoredEntry =
  | {
      readonly kind: StoredEntryKind.normal;
      readonly type: number;
      readonly body: Buffer;
    }
  | {
      readonly kind: StoredEntryKind.ref;
      readonly ref: string;
      readonly body: Buffer;
    }
  | {
      readonly kind: StoredEntryKind.offset;
      readonly referencedOffset: number;
      readonly body: Buffer;
    };

export interface Store {
  write(ref: string, offset: number, entry: StoredEntry): void | Promise<void>;
  getRef(
    ref: string,
  ): Promise<StoredEntry | undefined> | StoredEntry | undefined;
  getOffset(
    offset: number,
  ): Promise<StoredEntry | undefined> | StoredEntry | undefined;
}

class MemoryStore implements Store {
  private readonly _refs = new Map<string, StoredEntry>();
  private readonly _offsets = new Map<number, StoredEntry>();
  write(ref: string, offset: number, entry: StoredEntry) {
    this._refs.set(ref, entry);
    this._offsets.set(offset, entry);
  }
  getRef(ref: string) {
    return this._refs.get(ref);
  }
  getOffset(offset: number) {
    return this._offsets.get(offset);
  }
}

interface WrappedStore {
  write(ref: string, offset: number, entry: EntryData): Promise<void>;
  getRef(ref: string): Promise<StoredEntry | undefined>;
  getOffset(offset: number): Promise<StoredEntry | undefined>;
}
function wrapStore(store: Store, mode: 'compressed' | 'raw'): WrappedStore {
  switch (mode) {
    case 'compressed':
      return {
        async write(ref: string, offset: number, entry: EntryData) {
          await store.write(ref, offset, {
            ...entry,
            body: entry.body.compressed,
          });
        },
        async getRef(ref: string) {
          const result = await store.getRef(ref);
          return result
            ? {...result, body: await inflateBufferAsync(result.body)}
            : undefined;
        },
        async getOffset(offset: number) {
          const result = await store.getOffset(offset);
          return result
            ? {...result, body: await inflateBufferAsync(result.body)}
            : undefined;
        },
      };
    case 'raw':
      return {
        async write(ref: string, offset: number, entry: EntryData) {
          await store.write(ref, offset, {
            ...entry,
            body: entry.body.uncompressed,
          });
        },
        async getRef(ref: string) {
          return await store.getRef(ref);
        },
        async getOffset(offset: number) {
          return await store.getOffset(offset);
        },
      };
    default:
      return assertNever(mode);
  }
}
export interface PackfileParseOptions {
  store?: Store;
  storeMode?: 'compressed' | 'raw';
}
const noop = () => {};
export default class PackfileParserStream extends Duplex {
  constructor(options?: PackfileParseOptions) {
    const buffer: Buffer[] = [];

    let onRead = noop;
    super({
      readableObjectMode: true,
      writableHighWaterMark: 128 * 1024 * 1024,
      readableHighWaterMark: 2,
      read() {
        onRead();
      },
      write(chunk, _, cb) {
        buffer.push(chunk);
        cb();
      },
      final(cb) {
        (async () => {
          const input = Buffer.concat(buffer);
          for await (const entry of parsePackfile(input, options)) {
            if (!this.push(entry)) {
              // process.stdout.write(`🛑`);

              await new Promise<void>((resolve) => (onRead = resolve));
              onRead = noop;

              // process.stdout.write(`✅`);
            }
          }
          this.push(null);
        })().then(
          () => cb(),
          (ex) => {
            cb(ex);
          },
        );
      },
    });
  }
}

export async function* parsePackfile(
  data: Buffer,
  options?: PackfileParseOptions,
): AsyncGenerator<GitRawObject, void, unknown> {
  const store = wrapStore(
    options?.store ?? new MemoryStore(),
    options?.storeMode ?? 'compressed',
  );

  const buffer = createConsumableBuffer(data);

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
        const body = await parseBody(size);
        const referencedOffset = entryOffset - delta;
        yield await onEntry(
          {kind: StoredEntryKind.offset, referencedOffset, body},
          entryOffset,
        );
        break;
      }
      case 7: {
        // REF DELTA
        const ref = buffer.consumeBytes(20).toString('hex');
        const body = await parseBody(size);
        yield await onEntry(
          {kind: StoredEntryKind.ref, ref, body},
          entryOffset,
        );
        break;
      }
      default: {
        const body = await parseBody(size);
        yield await onEntry(
          {kind: StoredEntryKind.normal, type, body},
          entryOffset,
        );
        break;
      }
    }
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
    const {output, bytesWritten} = await inflateUnknownLengthAsync(
      buffer.readRemaining(),
    );
    const compressed = buffer.consumeBytes(bytesWritten);
    if (output.length !== expectedSize) {
      throw new Error(`Size mismatch`);
    }
    return {compressed, uncompressed: output};
  }

  async function resolveEntry(
    entry: StoredEntry,
  ): Promise<{type: number; body: Buffer}> {
    switch (entry.kind) {
      case StoredEntryKind.normal:
        return {
          type: entry.type,
          body: entry.body,
        };
      case StoredEntryKind.ref: {
        const base = await store.getRef(entry.ref);
        if (!base) {
          throw new Error(`Cannot find base of ref ${entry.ref}`);
        }
        const resolvedBase = await resolveEntry(base);
        const body = applyDelta(entry.body, resolvedBase.body);
        return {type: resolvedBase.type, body};
      }
      case StoredEntryKind.offset:
        const base = await store.getOffset(entry.referencedOffset);
        if (!base) {
          throw new Error(
            `Cannot find base of offset delta ${entry.referencedOffset}`,
          );
        }
        const resolvedBase = await resolveEntry(base);
        const body = applyDelta(entry.body, resolvedBase.body);
        return {type: resolvedBase.type, body};
      default:
        return assertNever(entry);
    }
  }
  async function onEntry(
    entryData: EntryData,
    offset: number,
  ): Promise<GitRawObject> {
    const entry = await resolveEntry({
      ...entryData,
      body: entryData.body.uncompressed,
    });

    const type = (GitObjectTypeID[entry.type] ?? `unknown`) as GitObjectType;
    const body = Buffer.concat([
      Buffer.from(`${type} ${entry.body.length}\0`, `utf8`),
      entry.body,
    ]);
    const hash = createHash('sha1').update(body).digest('hex');

    store.write(hash, offset, entryData);

    return {
      hash,
      type,
      body,
    };
  }
}

function createConsumableBuffer(buffer: Buffer) {
  let bufferOffset = 0;

  function getLength() {
    return buffer.length - bufferOffset;
  }
  function getOffset() {
    return bufferOffset;
  }

  function consumeByte() {
    return readAndConsume(1, () => buffer[bufferOffset]);
  }

  function consumeUInt32BE(): number {
    return readAndConsume(INT32_BYTES, () => buffer.readUInt32BE(bufferOffset));
  }

  function consumeBytes(bytes: number): Buffer {
    return readAndConsume(bytes, () =>
      buffer.slice(bufferOffset, bufferOffset + bytes),
    );
  }

  function readConsumed(): Buffer {
    return buffer.slice(0, bufferOffset);
  }
  function readRemaining(): Buffer {
    return buffer.slice(bufferOffset);
  }

  function consume(bytes: number) {
    readAndConsume(bytes, () => undefined);
  }
  function readAndConsume<T>(bytes: number, read: () => T): T {
    if (bufferOffset + bytes > buffer.length) {
      throw new Error(
        `There are not enough bytes in the buffer to consume ${bytes} bytes.`,
      );
    }
    const result = read();
    bufferOffset += bytes;
    return result;
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

async function inflateUnknownLengthAsync(buffer: Buffer) {
  return await new Promise<{output: Buffer; bytesWritten: number}>(
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

async function inflateBufferAsync(buffer: Buffer) {
  return await new Promise<Buffer>((resolve, reject) => {
    inflate(buffer, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
