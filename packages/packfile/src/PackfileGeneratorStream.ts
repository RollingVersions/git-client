import {createHash} from 'crypto';
import {Transform} from 'stream';
import {createDeflate} from 'zlib';
import {GitRawObject, GitObjectTypeID} from './types';

export default class PackfileGeneratorStream extends Transform {
  constructor({length}: {length: number}) {
    const hash = createHash('sha1');
    let writtenHead = false;
    const writeHead = () => {
      if (writtenHead) return;
      const head = Buffer.from([
        0x50,
        0x41,
        0x43,
        0x4b, // PACK
        0,
        0,
        0,
        2, // version 2
        length >> 24, // Num of objects
        (length >> 16) & 0xff,
        (length >> 8) & 0xff,
        length & 0xff,
      ]);
      hash.update(head);
      this.push(head);
    };
    super({
      writableObjectMode: true,
      transform(chunk: GitRawObject, _, callback) {
        writeHead();
        const type = GitObjectTypeID[chunk.type];
        // TODO: support packing deltas
        this.push(packFrameHeader(type, chunk.body.length));
        const deflateStream = createDeflate();
        deflateStream
          .on('data', (chunk) => {
            this.push(chunk);
          })
          .on('error', (err) => callback(err))
          .on('end', () => {
            callback();
          })
          .end(chunk.body);
      },
      flush(callback) {
        writeHead();
        this.push(hash.digest());
        callback();
      },
    });
  }
}

// write TYPE_AND_BASE128_SIZE
function packFrameHeader(type: GitObjectTypeID, length: number) {
  const head = [(type << 4) | (length & 0xf)];
  let i = 0;
  length >>= 4;
  while (length) {
    head[i++] |= 0x80;
    head[i] = length & 0x7f;
    length >>= 7;
  }
  return Buffer.from(head);
}
