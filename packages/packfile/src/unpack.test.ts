import {createHash} from 'crypto';
import {readFileSync} from 'fs';

import unpack from './unpack';

async function* input() {
  const pack = readFileSync(__dirname + '/../samples/sample1.pack');
  yield pack;
}
test('unpack sample', async () => {
  const entries = [];
  for await (const entry of unpack(input())) {
    entries.push(entry);
  }

  expect({
    hash: entries[2120].hash,
    type: entries[2120].type,
  }).toEqual({
    hash: 'def0c2614b88c6df95ac49c1e0f5e13494301142',
    type: 'blob',
  });
  expect(createHash('sha1').update(entries[2120].body).digest('hex')).toBe(
    entries[2120].hash,
  );
  expect(entries.length).toBe(2651);
});
