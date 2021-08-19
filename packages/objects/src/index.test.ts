import {createHash} from 'crypto';
import {encodeObject, decodeObject, GitObject, Type, Mode} from '.';

function testEncoding(inputObject: GitObject, expectedHash: string) {
  return () => {
    const objectBuffer = encodeObject(inputObject);
    expect(createHash('sha1').update(objectBuffer).digest('hex')).toBe(
      expectedHash,
    );
    expect(decodeObject(objectBuffer)).toEqual(inputObject);
  };
}

test(
  'save and load blob',
  testEncoding(
    {
      type: Type.blob,
      body: new Uint8Array(0),
    },
    'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391',
  ),
);

test(
  'save and load tree',
  testEncoding(
    {
      type: Type.tree,
      body: {
        file: {
          mode: Mode.file,
          hash: 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391',
        },
      },
    },
    'df2b8fc99e1c1d4dbc0a854d9f72157f1d6ea078',
  ),
);

test(
  'save and load commit',
  testEncoding(
    {
      type: Type.commit,
      body: {
        tree: 'df2b8fc99e1c1d4dbc0a854d9f72157f1d6ea078',
        parents: [],
        author: {
          name: 'Marius Gundersen',
          email: 'me@mariusgundersen.net',
          date: {
            seconds: 1500840368,
            offset: -2 * 60,
          },
        },
        committer: {
          name: 'Marius Gundersen',
          email: 'me@mariusgundersen.net',
          date: {
            seconds: 1500840368,
            offset: -2 * 60,
          },
        },
        message: 'test\n',
      },
    },
    '1a2ee41d9600863b43e7be9f9b69ccdd0436f3bd',
  ),
);

test(
  'save and load tag',
  testEncoding(
    {
      type: Type.tag,
      body: {
        object: '1a2ee41d9600863b43e7be9f9b69ccdd0436f3bd',
        type: Type.commit,
        tag: 'test',
        tagger: {
          name: 'Marius Gundersen',
          email: 'me@mariusgundersen.net',
          date: {
            seconds: 1500841617,
            offset: -2 * 60,
          },
        },
        message: 'test\n',
      },
    },
    '68de69ef5c1be77fbf31a39d251d277295174897',
  ),
);
