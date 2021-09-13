import {
  composeLsRefsCommand,
  LsRefsCommand,
  LsRefsResponseEntry,
  parseLsRefsResponse,
} from '@rollingversions/git-protocol';
import {ContextWithServerCapabilities} from './Context';

const defaultCapabilities: [string, string | boolean][] = [
  ['object-format', 'sha1'],
];
export type {LsRefsCommand, LsRefsResponseEntry};
export default async function lsRefs<
  THeaders extends {set(name: string, value: string): unknown}
>(
  repoURL: URL,
  command: LsRefsCommand,
  ctx: ContextWithServerCapabilities<THeaders>,
): Promise<LsRefsResponseEntry[]> {
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
    composeLsRefsCommand(
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
  return await parseLsRefsResponse(response.body);
}
