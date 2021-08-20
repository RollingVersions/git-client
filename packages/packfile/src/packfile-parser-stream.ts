import {createHash, Hash} from 'crypto';
import {Transform} from 'stream';
import {createInflate} from 'zlib';
import {Type, Entry} from './types';

// interface BaseState {
//   /**
//    *
//    */
//   readonly buffer: Buffer;
//   /**
//    * Byte offset from start of stream
//    */
//   readonly offset: number;
//   /**
//    * Git protocol version
//    */
//   readonly version: 2 | 3;

//   readonly entriesCount: number;
//   readonly entryIndex: number;
// }
// interface StateStart extends Pick<BaseState, 'buffer' | 'offset'> {
//   readonly type: 'start';
// }
// interface StateParsingVersion extends Pick<BaseState, 'buffer' | 'offset'> {
//   readonly type: 'parsing-version';
// }
// interface StateParsingEntriesCount
//   extends Pick<BaseState, 'buffer' | 'offset' | 'version'> {
//   readonly type: 'parsing-entries-count';
// }
// interface StateParsingHeader
//   extends Pick<
//     BaseState,
//     'buffer' | 'offset' | 'version' | 'entriesCount' | 'entryIndex'
//   > {
//   readonly type: 'parsing-header';
// }

// type State =
//   | StateStart
//   | StateParsingVersion
//   | StateParsingEntriesCount
//   | StateParsingHeader;

type State = (chunk: Buffer | null) => Promise<State>;

interface BaseContext {
  digest: Hash;
  onEntry: (entry: Entry) => void;
}
interface HeaderContext extends BaseContext {
  version: 2 | 3;
  entriesCount: number;
  entryIndex: number;
  offset: number;
}

interface BodyContext extends HeaderContext {
  entryOffset: number;
  size: number;
}

export class PackfileParserStream extends Transform {
  constructor() {
    let state: Promise<State> | undefined;
    super({
      readableObjectMode: true,
      transform(chunk, _, callback) {
        state = state
          ? state.then((s) => s(chunk))
          : parseStart(chunk, {
              digest: createHash('sha1'),
              onEntry: (entry) => {
                this.push(entry);
              },
            });
        state.then(
          () => {
            callback(null);
          },
          (err) => {
            callback(err);
          },
        );
      },
      flush(callback) {
        if (state) {
          state
            .then((s) => s(null))
            .then(
              () => callback(null),
              (err) => callback(err),
            );
        } else {
          callback(new Error(`Unexpected end of stream`));
        }
      },
    });
  }
}
// The first four bytes in a packfile are the bytes 'PACK'

// The version is stored as an unsigned 32 integer in network byte order.
// It must be version 2 or 3.

// The number of objects in this packfile is also stored as an unsigned 32 bit int.

const HEADER_LENGTH = 4 * 3;
async function parseStart(chunk: Buffer, ctx: BaseContext): Promise<State> {
  if (chunk.length < HEADER_LENGTH) {
    return await waitForMore(
      chunk,
      async (chunk) => await parseStart(chunk, ctx),
    );
  }

  const packfileHeader = chunk.readUInt32BE(0);
  if (packfileHeader !== 0x5041434b) {
    throw new Error('Invalid packfile header');
  }

  const version = chunk.readUInt32BE(4);
  if (version !== 2 && version !== 3) {
    throw new Error('Invalid version number ' + version);
  }

  const entriesCount = chunk.readUInt32BE(8);

  ctx.digest.update(chunk.slice(0, HEADER_LENGTH));
  return await parseHeader(chunk.slice(HEADER_LENGTH), {
    ...ctx,
    version,
    entriesCount,
    entryIndex: 0,
    offset: HEADER_LENGTH,
  });
}

// n-byte type and length (3-bit type, (n-1)*7+4-bit length)
// CTTTSSSS
// C is continue bit, TTT is type, S+ is length
// Second state in the same header parsing.
// CSSSSSSS*
async function parseHeader(chunk: Buffer, ctx: HeaderContext): Promise<State> {
  if (ctx.entryIndex >= ctx.entriesCount) {
    return await parseChecksum(chunk, ctx);
  }
  if (!chunk.length) {
    return await waitForMore(
      chunk,
      async (chunk) => await parseHeader(chunk, ctx),
    );
  }

  let offset = ctx.offset;
  const entryOffset = ctx.offset;
  let byte = chunk[0];
  const type = (byte >> 4) & 0x7;
  let size = byte & 0xf;
  let left = 4;

  offset++;
  ctx.digest.update(chunk.slice(0, 1));
  return parseChunk(chunk.slice(1));
  async function parseChunk(chunk: Buffer | null): Promise<State> {
    if (!chunk) {
      throw new Error(`Unexpected end of stream`);
    }
    let i = 0;
    while (byte & 0x80) {
      if (i >= chunk.length) {
        ctx.digest.update(chunk);
        return parseChunk;
      }
      offset++;
      byte = chunk[i++];
      size |= (byte & 0x7f) << left;
      left += 7;
    }
    ctx.digest.update(chunk.slice(0, i));
    return await end(chunk.slice(i));
  }
  async function end(remaining: Buffer): Promise<State> {
    switch (type) {
      case 6:
        return await ofsDelta(remaining, {
          ...ctx,
          entryOffset,
          offset,
          size,
        });
      case 7:
        return await refDelta(remaining, {
          ...ctx,
          entryOffset,
          offset,
          size,
        });
      default:
        return await parseBody(
          remaining,
          {
            ...ctx,
            entryOffset,
            offset,
            size,
          },
          (body) => {
            ctx.onEntry({type, body, offset: entryOffset});
          },
        );
    }
  }
}

// Big-endian modified base 128 number encoded ref offset
async function ofsDelta(chunk: Buffer, ctx: BodyContext): Promise<State> {
  if (!chunk.length)
    return await waitForMore(
      chunk,
      async (buffer) => await ofsDelta(buffer, ctx),
    );

  let offset = ctx.offset;
  let byte = chunk[0];
  let ref = byte & 0x7f;

  offset++;
  ctx.digest.update(chunk.slice(0, 1));
  return parseChunk(chunk.slice(1));
  async function parseChunk(chunk: Buffer | null): Promise<State> {
    if (!chunk) {
      throw new Error(`Unexpected end of stream`);
    }
    let i = 0;
    while (byte & 0x80) {
      if (i >= chunk.length) {
        ctx.digest.update(chunk);
        return parseChunk;
      }
      offset++;
      byte = chunk[i++];
      ref = ((ref + 1) << 7) | (byte & 0x7f);
    }
    ctx.digest.update(chunk.slice(0, i));
    return await end(chunk.slice(i));
  }
  async function end(remaining: Buffer): Promise<State> {
    return parseBody(
      remaining,
      {
        ...ctx,
        offset,
      },
      (body) => {
        ctx.onEntry({
          type: Type.ofsDelta,
          ref,
          body,
          offset: ctx.entryOffset,
        });
      },
    );
  }
}

// 20 byte raw sha1 hash for ref
async function refDelta(chunk: Buffer, ctx: BodyContext): Promise<State> {
  if (chunk.length < 20) {
    return await waitForMore(
      chunk,
      async (chunk) => await refDelta(chunk, ctx),
    );
  }
  const ref = chunk.slice(0, 20).toString('hex');
  const remaining = chunk.slice(20);
  return await parseBody(
    remaining,
    {
      ...ctx,
      offset: ctx.offset + 20,
    },
    (body) => {
      ctx.onEntry({
        type: Type.refDelta,
        ref,
        body,
        offset: ctx.entryOffset,
      });
    },
  );
}

// Feed the deflated code to the inflate engine
async function parseBody(
  chunk: Buffer,
  ctx: BodyContext,
  onBody: (body: Buffer) => void,
): Promise<State> {
  let inflateEnded = false;
  const inflate = createInflate();
  const inputBuffers: Buffer[] = [];
  const outputBuffers: Buffer[] = [];
  const nextParser = new Promise<State>((resolve, reject) => {
    inflate.on(`data`, (buffer) => {
      outputBuffers.push(buffer);
    });
    inflate.on('error', (err) => {
      inflateEnded = true;
      reject(err);
    });
    inflate.on('end', () => {
      inflateEnded = true;
      const outputBuffer = Buffer.concat(outputBuffers);
      if (outputBuffer.length !== ctx.size) {
        throw new Error(
          `Length mismatch, expected ${ctx.size} got ${outputBuffer.length}`,
        );
      }
      onBody(outputBuffer);

      const inputBuffer = Buffer.concat(inputBuffers);
      ctx.digest.update(inputBuffer.slice(0, inflate.bytesWritten));
      const remaining = inputBuffer.slice(inflate.bytesWritten);
      resolve(
        parseHeader(remaining, {
          ...ctx,
          entryIndex: ctx.entryIndex + 1,
          offset: ctx.offset + inflate.bytesWritten,
        }),
      );
    });
  });
  return writeChunk(chunk);
  async function writeChunk(chunk: Buffer | null): Promise<State> {
    if (!chunk || inflateEnded) {
      if (!inflateEnded) {
        inflate.end();
      }
      return await (await nextParser)(chunk);
    }
    inputBuffers.push(chunk);
    inflate.write(chunk);
    // if (!inflate.write(chunk)) {
    //   await new Promise<void>((resolve, reject) => {
    //     function onResume() {
    //       inflate.off(`resume`, onResume);
    //       inflate.off(`error`, onError);
    //       resolve();
    //     }
    //     function onError(err: Error) {
    //       inflate.off(`resume`, onResume);
    //       inflate.off(`error`, onError);
    //       reject(err);
    //     }
    //     inflate.on(`resume`, onResume);
    //     inflate.on(`error`, onError);
    //   });
    // }
    return writeChunk;
  }

  // const inf = new pako.Inflate();
  // do {
  //   inf.push(await state.buffer.chunk());
  // } while (inf.err === 0 && inf.result === undefined);
  // state.buffer.rewind((inf as any).strm.avail_in);
  // if (inf.err != 0) throw new Error(`Inflate error ${inf.err} ${inf.msg}`);
  // const data = inf.result as Uint8Array;
  // if (data.length !== state.size)
  //   throw new Error(
  //     `Length mismatch, expected ${state.size} got ${data.length}`,
  //   );

  // return {
  //   ...state,
  //   state: 'entry',
  //   entry: entry(state, data),
  //   entryIndex: state.entryIndex + 1,
  // };
}

// 20 byte checksum
async function parseChecksum(
  chunk: Buffer,
  ctx: HeaderContext,
): Promise<State> {
  if (chunk.length < 20) {
    return waitForMore(chunk, (chunk) => parseChecksum(chunk, ctx));
  }
  const actual = ctx.digest.digest('hex');
  const checksum = chunk.slice(0, 20).toString('hex');
  if (checksum !== actual) {
    throw new Error(
      `Checksum mismatch: actual ${actual} != expected ${checksum}`,
    );
  }
  return done;
  async function done(_chunk: Buffer | null): Promise<State> {
    return done;
  }
}

// async function consume(
//   chunk: Buffer | null,
//   bytes: number,
//   handler: (buffer: Buffer, rest: Buffer) => Promise<State>,
// ): Promise<State> {
//   if (!chunk) {
//     throw new Error(`Unexpected end of input stream`);
//   }
//   if (chunk.length < bytes) {
//     return await waitForMore(
//       chunk,
//       async (chunk) => await consume(chunk, bytes, handler),
//     );
//   }
//   return await handler(chunk.slice(0, bytes), chunk.slice(bytes));
// }

function waitForMore(
  buffer: Buffer,
  handler: (buffer: Buffer) => Promise<State>,
): State {
  return async (chunk: Buffer | null) => {
    if (!chunk) {
      throw new Error(`Unexpected end of input stream`);
    }
    return await handler(Buffer.concat([buffer, chunk]));
  };
}
