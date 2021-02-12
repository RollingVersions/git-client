import {encode, NEWLINE} from '@es-git/core';

const NEWLINE_ARRAY = [NEWLINE];
export default function joinWithNewline(...values: (string | Uint8Array)[]) {
  const buffers = values.map((v) => (typeof v === 'string' ? encode(v) : v));
  const size = values.length - 1 + buffers.reduce((a, b) => a + b.length, 0);
  let result = new Uint8Array(size);
  let offset = 0;
  for (const buffer of buffers) {
    if (offset > 0) {
      result.set(NEWLINE_ARRAY, offset++);
    }
    result.set(buffer, offset);
    offset += buffer.length;
  }
  return result;
}
