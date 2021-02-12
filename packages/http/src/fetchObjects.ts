import {
  composeFetchCommand,
  parseFetchResponse,
  FetchCommand,
  FetchResponseEntryError,
  FetchResponseEntry,
  FetchResponseEntryHeader,
  FetchResponseEntryKind,
  FetchResponseEntryObject,
  FetchResponseEntryProgress,
} from '@rollingversions/git-protocol';
import {ContextWithServerCapabilities} from './Context';

const defaultCapabilities: [string, string | boolean][] = [
  ['object-format', 'sha1'],
];
export type {
  FetchCommand,
  FetchResponseEntryError,
  FetchResponseEntryHeader,
  FetchResponseEntryProgress,
  FetchResponseEntryObject,
  FetchResponseEntry,
};

export {FetchResponseEntryKind};

export default async function* fetchObjects<
  THeaders extends {set(name: string, value: string): unknown}
>(
  repoURL: URL,
  command: FetchCommand,
  ctx: ContextWithServerCapabilities<THeaders>,
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
  yield* parseFetchResponse(
    ctx.http.post(
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
    ),
  );
}
