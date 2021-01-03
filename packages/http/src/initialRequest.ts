import {
  Capabilities,
  parseInitialResponse,
} from '@rollingversions/git-protocol';
import Context from './Context';

export interface InitialResponse {
  capabilities: Capabilities;
}
export default async function initialRequest(
  repoURL: URL,
  ctx: Context,
): Promise<InitialResponse> {
  const url = new URL(
    `${
      repoURL.href.endsWith('.git') ? repoURL.href : `${repoURL.href}.git`
    }/info/refs?service=git-upload-pack`,
  );
  const headers = ctx.http.createHeaders(url);
  headers.set('git-protocol', 'version=2');
  headers.set('user-agent', ctx.agent);
  const capabilities = await parseInitialResponse(ctx.http.get(url, headers));
  return {capabilities};
}
