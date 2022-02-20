import initialRequest from './initialRequest';
import HttpProxy from './HttpProxy';

test('initialRequest', async () => {
  const {url, capabilities} = await initialRequest(
    new URL(
      'https://github.com/RollingVersions/test-single-npm-package-github-actions.git',
    ),
    {http: HttpProxy, agent: 'rollingversions.com'},
  );
  expect(url.href).toBe(
    `https://github.com/RollingVersions/test-single-npm-package-github-actions.git`,
  );
  expect(typeof capabilities.get('agent')).toBe('string');
  expect(capabilities.get('ls-refs')).toBe('unborn');
  expect(capabilities.get('fetch')).toBe('shallow wait-for-done filter');
  expect(capabilities.get('server-option')).toBe(true);
  expect(capabilities.get('object-format')).toBe('sha1');
});
