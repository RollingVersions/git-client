import {decode, encode} from '@rollingversions/git-core';
import {pack, unpack} from './index';

test('pack-unpack', async () => {
  const blobs = ['blob 4\0test', 'commit 7\0testing'];

  const result = [];
  for await (const entry of unpack(pack(prepare(blobs), blobs.length))) {
    result.push(decode(entry.body));
  }
  expect(result).toEqual(['commit 7\0testing', 'blob 4\0test']);
});

async function* prepare(blobs: string[]) {
  for (const blob of blobs) {
    yield ['00', encode(blob)] as const;
  }
}
