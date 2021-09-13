import {
  Capabilities,
  parseInitialResponse,
} from '@rollingversions/git-protocol';
import Context from './Context';

export interface InitialResponse {
  capabilities: Capabilities;
}
export default async function initialRequest<
  THeaders extends {set(name: string, value: string): unknown}
>(repoURL: URL, ctx: Context<THeaders>): Promise<InitialResponse> {
  const url = new URL(
    `${
      repoURL.href.endsWith('.git') ? repoURL.href : `${repoURL.href}.git`
    }/info/refs?service=git-upload-pack`,
  );
  const headers = ctx.http.createHeaders(url);
  headers.set('git-protocol', 'version=2');
  headers.set('user-agent', ctx.agent);

  const response = await ctx.http.get(url, headers);

  if (response.statusCode !== 200) {
    const body = await new Promise<Buffer>((resolve, reject) => {
      const body: Buffer[] = [];
      response.body
        .on(`data`, (chunk) => body.push(chunk))
        .on(`error`, reject)
        .on(`end`, () => resolve(Buffer.concat(body)));
    });
    throw new Error(
      `Git server responded with status ${response.statusCode}: ${body.toString(
        `utf8`,
      )}`,
    );
  }
  console.log('response.url =', response.url.href);

  const capabilities = await parseInitialResponse(response.body);
  return {capabilities};
}
