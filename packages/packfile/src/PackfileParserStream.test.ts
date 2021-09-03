import {createHash} from 'crypto';
import {readFileSync, createReadStream} from 'fs';
import PackfileParserStream from './PackfileParserStream';

const expectedEntries = JSON.parse(
  readFileSync(__dirname + '/../samples/sample1.json', 'utf8'),
);

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
      const expectedEntry = expectedEntries[index++];
      expect({
        type: entry.type,
        hash: entry.hash,
        body: createHash('sha1').update(entry.body).digest('hex'),
      }).toEqual({
        type: expectedEntry.type,
        hash: expectedEntry.hash,
        body: expectedEntry.hash,
      });
      entries.push(entry);
    });
    parser.on(`end`, () => resolve());
  });
  expect(entries.length).toBe(2651);
});
