import {treeDepth} from '@rollingversions/git-protocol';
import {collect} from '.';
import fetchObjects, {FetchResponseEntryKind} from './fetchObjects';
import HttpProxy from './HttpProxy';

test('fetchObjects', async () => {
  const results = await collect(
    fetchObjects(
      new URL(
        'https://github.com/RollingVersions/test-single-npm-package-github-actions.git',
      ),
      {
        want: ['03ca392fee460157e6fef84f0dcd6679f66af891'],
        have: ['cb73a4316c9d09477a54c564bffafec4fc54f7e0'],
        filter: [treeDepth(0)],
      },
      {
        http: HttpProxy,
        agent: 'rollingversions.com',
        serverCapabilities: new Map<string, string | boolean>([
          ['agent', 'git/github-gb13cc0c1a7bd'],
          ['ls-refs', true],
          ['fetch', 'shallow filter'],
          ['server-option', true],
          ['object-format', 'sha1'],
        ]),
      },
    ),
  );
  expect(
    results
      .flatMap((e) =>
        e.kind === FetchResponseEntryKind.Object
          ? [`${e.type}(${e.hash})`]
          : [],
      )
      .sort(),
  ).toEqual([
    'commit(03ca392fee460157e6fef84f0dcd6679f66af891)',
    'commit(a0762d4f1ef04a03c5a603f786ce598397b1610d)',
  ]);
});
