import {
  composeFetchCommand,
  parseFetchResponse,
  FetchCommand,
  FetchResponseEntryObject,
  FetchCommandOutputOptions,
} from '@rollingversions/git-protocol';
import {ContextWithServerCapabilities} from './Context';

const defaultCapabilities: [string, string | boolean][] = [
  ['object-format', 'sha1'],
];
export type {FetchCommand, FetchResponseEntryObject};

export default async function fetchObjects<
  THeaders extends {set(name: string, value: string): unknown}
>(
  repoURL: URL,
  command: FetchCommand,
  {
    raw,
    references,
    offsets,
    ...ctx
  }: ContextWithServerCapabilities<THeaders> & FetchCommandOutputOptions,
) {
  const url = new URL(
    `${
      repoURL.href.endsWith('.git') ? repoURL.href : `${repoURL.href}.git`
    }/git-upload-pack`,
  );
  const headers = ctx.http.createHeaders(url);
  headers.set('accept', 'application/x-git-upload-pack-result');
  headers.set('content-type', 'application/x-git-upload-pack-request');
  headers.set('git-protocol', 'version=2');
  headers.set('user-agent', ctx.agent);

  const response = await ctx.http.post(
    url,
    headers,
    composeFetchCommand(
      command,
      new Map(
        [
          ['agent', ctx.agent] as const,
          ...defaultCapabilities,
        ].filter(([key]) => ctx.serverCapabilities.has(key)),
      ),
    ),
  );
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
  return parseFetchResponse(response.body, {raw, references, offsets});
}
