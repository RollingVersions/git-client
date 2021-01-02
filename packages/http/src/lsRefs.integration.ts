import {collect} from '.';
import lsRefs from './lsRefs';
import ProxyFetch from './ProxyFetch';

test('lsRefs', async () => {
  const refs = await collect(
    lsRefs(
      new URL(
        'https://github.com/RollingVersions/test-single-npm-package-github-actions.git',
      ),
      {
        symrefs: true,
        peel: true,
        refPrefix: ['refs/heads/', 'refs/tags/', 'HEAD'],
      },
      {
        fetch: ProxyFetch,
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
  expect(refs.find((r) => r.refName === 'HEAD')).toEqual({
    objectID: expect.any(String),
    peeled: [],
    refName: 'HEAD',
    symrefTarget: expect.stringContaining('refs/heads/'),
  });
  expect(
    refs.find(
      (r) =>
        r.refName ===
        'refs/tags/@rollingversions/test-single-npm-package-github-actions@1.0.0',
    ),
  ).toEqual({
    objectID: 'cb73a4316c9d09477a54c564bffafec4fc54f7e0',
    peeled: [],
    refName:
      'refs/tags/@rollingversions/test-single-npm-package-github-actions@1.0.0',
    symrefTarget: null,
  });
});
