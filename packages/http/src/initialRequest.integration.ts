import initialRequest from './initialRequest';
import ProxyFetch from './ProxyFetch';

test('initialRequest', async () => {
  const {capabilities} = await initialRequest(
    new URL(
      'https://github.com/RollingVersions/test-single-npm-package-github-actions.git',
    ),
    {fetch: ProxyFetch, agent: 'rollingversions.com'},
  );
  expect(typeof capabilities.get('agent')).toBe('string');
  expect(capabilities.get('ls-refs')).toBe(true);
  expect(capabilities.get('fetch')).toBe('shallow filter');
  expect(capabilities.get('server-option')).toBe(true);
  expect(capabilities.get('object-format')).toBe('sha1');
});
