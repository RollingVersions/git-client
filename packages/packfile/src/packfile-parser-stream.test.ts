import {createHash} from 'crypto';
import {createReadStream, readFileSync} from 'fs';
import {PackfileParserStream} from './packfile-parser-stream';
import parsePackfile from './parse-packfile';

async function* input() {
  const pack = readFileSync(__dirname + '/../samples/sample1.pack');
  yield pack;
}
const expectedEntries: any[] = [];
test('unpack sample', async () => {
  for await (const entry of parsePackfile(input())) {
    expectedEntries.push(entry);
  }

  expect(expectedEntries.length).toBe(2651);
});

test('unpack sample', async () => {
  const entries: any[] = [];
  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(__dirname + '/../samples/sample1.pack');
    const parser = new PackfileParserStream();

    input.pipe(parser);

    input.on(`error`, (err) => reject(err));
    parser.on(`error`, (err) => reject(err));
    let index = 0;
    parser.on(`data`, (entry) => {
      // console.log(`type =`, entry.type);
      const expectedEntry = expectedEntries[index++];
      expect({
        type: entry.type,
        offset: entry.offset,
        body: createHash('sha1').update(entry.body).digest('hex'),
      }).toEqual({
        type: expectedEntry.type,
        offset: expectedEntry.offset,
        body: createHash('sha1').update(expectedEntry.body).digest('hex'),
      });
      entries.push(entry);
    });
    parser.on(`end`, () => resolve());
  });
  // const entries = [];
  // for await (const entry of unpack(input())) {
  //   entries.push(entry);
  // }

  // expect({
  //   hash: entries[2120].hash,
  //   type: entries[2120].type,
  // }).toEqual({
  //   hash: 'def0c2614b88c6df95ac49c1e0f5e13494301142',
  //   type: 'blob',
  // });
  // expect(createHash('sha1').update(entries[2120].body).digest('hex')).toBe(
  //   entries[2120].hash,
  // );
  expect(entries.length).toBe(2651);
});
