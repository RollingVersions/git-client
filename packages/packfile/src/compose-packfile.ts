import {createHash} from 'crypto';

import * as pako from 'pako';

import {Type, Entry} from './types';

export default async function* composePackfile(
  items: AsyncIterableIterator<Entry>,
  count: number,
) {
  const hash = createHash('sha1');

  const head = packHeader(count);
  hash.update(head);
  yield head;

  for await (const item of items) {
    for (const chunk of packFrame(item)) {
      hash.update(chunk);
      yield chunk;
    }
  }

  yield hash.digest();
}

function packHeader(length: number) {
  return Uint8Array.from([
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
}

function* packFrame(item: Entry) {
  yield packFrameHeader(item.type, item.body.length);

  if (item.type === Type.ofsDelta) {
    yield packOfsDelta(item.ref);
  } else if (item.type === Type.refDelta) {
    yield Buffer.from(item.ref, 'hex');
  }

  yield pako.deflate(item.body);
}

// write TYPE_AND_BASE128_SIZE
function packFrameHeader(type: number, length: number) {
  const head = [(type << 4) | (length & 0xf)];
  let i = 0;
  length >>= 4;
  while (length) {
    head[i++] |= 0x80;
    head[i] = length & 0x7f;
    length >>= 7;
  }
  return new Uint8Array(head);
}

// write BIG_ENDIAN_MODIFIED_BASE_128_NUMBER
function packOfsDelta(ref: number) {
  let offset = ref;
  // Calculate how many digits we need in base 128
  let i = Math.floor(Math.log(offset) / Math.log(0x80));
  const head = new Uint8Array(i + 1);
  // Write the last digit
  head[i] = offset & 0x7f;
  // Then write the rest
  while ((offset >>= 7)) {
    head[--i] = 0x80 | (--offset & 0x7f);
  }
  return head;
}
