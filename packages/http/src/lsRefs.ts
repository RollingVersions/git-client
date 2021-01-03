import {
  composeLsRefsCommand,
  LsRefsCommand,
  parseLsRefsResponse,
} from '@rollingversions/git-protocol';
import {ContextWithServerCapabilities} from './Context';

const defaultCapabilities: [string, string | boolean][] = [
  ['object-format', 'sha1'],
];
export type {LsRefsCommand};
export default async function* lsRefs(
  repoURL: URL,
  command: LsRefsCommand,
  ctx: ContextWithServerCapabilities,
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
  yield* parseLsRefsResponse(
    ctx.http.post(
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
    ),
  );
}
