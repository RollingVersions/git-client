import {
  Capabilities,
  parseInitialResponse,
} from '@rollingversions/git-protocol';
import HttpContext from './HttpContext';

export interface InitialResponse {
  capabilities: Capabilities;
}
export default async function initialRequest(
  repoURL: URL,
  ctx: HttpContext,
): Promise<InitialResponse> {
  const url = new URL(
    `${
      repoURL.href.endsWith('.git') ? repoURL.href : `${repoURL.href}.git`
    }/info/refs?service=git-upload-pack`,
  );
  const headers = ctx.fetch.createHeaders(url);
  headers.set('git-protocol', 'version=2');
  headers.set('user-agent', ctx.agent);
  const capabilities = await parseInitialResponse(ctx.fetch.get(url, headers));
  return {capabilities};
}
