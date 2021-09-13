import {createHash} from 'crypto';
import {Transform} from 'stream';
import {createDeflate} from 'zlib';
import {GitRawObject, GitObjectTypeID} from './types';

export default class PackfileGeneratorStream extends Transform {
  constructor({entryCount}: {entryCount: number}) {
    const hash = createHash('sha1');
    let writtenHead = false;
    const writeHead = () => {
      if (writtenHead) return;
      writtenHead = true
      const head = Buffer.from([
        0x50,
        0x41,
        0x43,
        0x4b, // PACK
        0,
        0,
        0,
        2, // version 2
        entryCount >> 24, // Num of objects
        (entryCount >> 16) & 0xff,
        (entryCount >> 8) & 0xff,
        entryCount & 0xff,
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

        const space = chunk.body.indexOf(0x20);
        if (space < 0) throw new Error('Invalid git object buffer');
        const nil = chunk.body.indexOf(0x00, space);
        if (nil < 0) throw new Error('Invalid git object buffer');
        const body = chunk.body.subarray(nil + 1);

        const frameHeader = packFrameHeader(type, body.length)
        hash.update(frameHeader)
        this.push(frameHeader);

        const deflateStream = createDeflate();
        deflateStream
          .on('data', (chunk) => {
            hash.update(chunk)
            this.push(chunk);
          })
          .on('error', (err) => callback(err))
          .on('end', () => {
            callback();
          })
          .end(body);
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
