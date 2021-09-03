import {createReadStream} from 'fs';
import PackfileParserStream from './PackfileParserStream';

test('unpack sample', async () => {
  const entries: any[] = [];
  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(__dirname + '/../samples/sample1.pack');
    const parser = new PackfileParserStream();

    input.pipe(parser);

    input.on(`error`, (err) => reject(err));
    parser.on(`error`, (err) => reject(err));
    // let index = 0;
    parser.on(`data`, (entry) => {
      // console.log(`type =`, entry.type);
      // const expectedEntry = expectedEntries[index++];
      // expect({
      //   type: entry.type,
      //   offset: entry.offset,
      //   body: createHash('sha1').update(entry.body).digest('hex'),
      // }).toEqual({
      //   type: expectedEntry.type,
      //   offset: expectedEntry.offset,
      //   body: createHash('sha1').update(expectedEntry.body).digest('hex'),
      // });
      entries.push(entry);
    });
    parser.on(`end`, () => resolve());
  });
  expect(entries.length).toBe(2651);
});
