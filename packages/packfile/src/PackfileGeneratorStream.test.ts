import {createHash} from 'crypto';
import {readFileSync, createReadStream, createWriteStream} from 'fs';
import PackfileGeneratorStream from './PackfileGeneratorStream';
import PackfileParserStream from './PackfileParserStream';

const expectedEntries = JSON.parse(
  readFileSync(__dirname + '/../samples/sample1.json', 'utf8'),
);

test('unpack sample, pack it again, and write to file', async () => {
  await new Promise<void>((resolve, reject) => {
    createReadStream(__dirname + '/../samples/sample1.pack')
      .on(`error`, (err) => reject(err))
      .pipe(new PackfileParserStream())
      .on(`error`, (err) => reject(err))
      .pipe(new PackfileGeneratorStream({entryCount: 2651}))
      .on(`error`, (err) => reject(err))
      .pipe(createWriteStream(__dirname + '/../samples/output.pack'))
      .on(`error`, (err) => reject(err))
      .on(`close`, () => resolve())
  });
});

test('unpack sample, pack it again, then unpack it again', async () => {
  const entries: any[] = [];
  await new Promise<void>((resolve, reject) => {
    const parser = new PackfileParserStream();

    createReadStream(__dirname + '/../samples/sample1.pack')
      .on(`error`, (err) => reject(err))
      .pipe(new PackfileParserStream())
      .on(`error`, (err) => reject(err))
      .pipe(new PackfileGeneratorStream({entryCount: 2651}))
      .on(`error`, (err) => reject(err))
      .pipe(parser);

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
