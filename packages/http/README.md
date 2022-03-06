# @rollingversions/git-http

Low level client for the git http/https protocol-v2.

## API

### Types

#### HttpInterface

```ts
interface HttpInterface<
  THeaders extends {
    set(name: string, value: string): unknown;
  }
> {
  createHeaders(url: URL): THeaders;
  get(url: URL, headers: THeaders): AsyncIterableIterator<Uint8Array>;
  post(
    url: URL,
    headers: THeaders,
    body: AsyncIterableIterator<Uint8Array>,
  ): AsyncIterableIterator<Uint8Array>;
}
```

Implement this if you want to provide your own custom implementation of the HTTP protocol.

#### Context

```ts
interface Context {
  readonly http: HttpInterface;
  readonly agent: string;
}
```

Options required by all methods.

#### ContextWithServerCapabilities

```ts
interface ContextWithServerCapabilities extends Context {
  readonly serverCapabilities: Capabilities;
}
```

After the initial request, all other requests require an object detailing th server capabilities

### Constants

#### DEFAULT_HTTP_HANDLER

An implementation of `HttpInterface` using `http-basic`. You can wrap these if you need to set additional headers (e.g. for auth).

### Methods

#### initialRequest

```ts
interface InitialResponse {
  capabilities: Capabilities;
}
function initialRequest(repoURL: URL, ctx: Context): Promise<InitialResponse>;
```

Get the capabilities of the remote server, you should call this once per repo before calling any other methods.

#### lsRefs

```ts
interface LsRefsCommand {
  /**
   * In addition to the object pointed by it, show the underlying ref
   * pointed by it when showing a symbolic ref.
   *
   * @default false
   */
  symrefs?: boolean;
  /**
   * Show peeled tags.
   *
   * @default false
   */
  peel?: boolean;
  /**
   * When specified, only references having a prefix matching one of
   * the provided prefixes are displayed.
   */
  refPrefix?: readonly string[];
}
interface LsRefsResponseEntry {
  objectID: string;
  refName: string;
  symrefTarget: string | null;
  peeled: string[];
}
function lsRefs(
  repoURL: URL,
  command: LsRefsCommand,
  ctx: ContextWithServerCapabilities,
): AsyncIterableIterator<LsRefsResponseEntry>;
```

Read the current target commit for each ref in the repo.

#### fetchObjects

```ts
// Some options require the server to have advertised the matching feature, e.g.
// "filter" requires the server to have advertised the "filter" feature in the
// "fetch" capability. This would look something like: `fetch=shallow filter`
interface FetchCommand {
  /**
   * Indicates to the server an object which the client wants to
   * retrieve.  Wants can be anything and are not limited to
   * advertised objects.
   */
  want: readonly string[];
  /**
   * Indicates to the server an object which the client has locally.
   * This allows the server to make a packfile which only contains
   * the objects that the client needs. Multiple 'have' lines can be
   * supplied.
   */
  have?: readonly string[];

  /**
   * Request that a thin pack be sent, which is a pack with deltas
   * which reference base objects not contained within the pack (but
   * are known to exist at the receiving end). This can reduce the
   * network traffic significantly, but it requires the receiving end
   * to know how to "thicken" these packs by adding the missing bases
   * to the pack.
   *
   * @default false
   */
  thinPack?: boolean;

  /**
   * Request that progress information that would normally be sent on
   * side-band channel 2, during the packfile transfer, should not be
   * sent.  However, the side-band channel 3 is still used for error
   * responses.
   *
   * @default false
   */
  noProgress?: boolean;

  /**
   * Request that annotated tags should be sent if the objects they
   * point to are being sent.
   *
   * @default false
   */
  includeTag?: boolean;

  /**
   * A client must notify the server of all commits for which it only
   * has shallow copies (meaning that it doesn't have the parents of
   * a commit) by supplying a 'shallow <oid>' line for each such
   * object so that the server is aware of the limitations of the
   * client's history.  This is so that the server is aware that the
   * client may not have all objects reachable from such commits.
   *
   * Requires the "shallow" feature on the server
   */
  shallow?: readonly string[];
  /**
   * Requests that the fetch/clone should be shallow having a commit
   * depth of <depth> relative to the remote side.
   *
   * Requires the "shallow" feature on the server
   */
  deepen?: number;
  /**
   * Requests that the semantics of the "deepen" command be changed
   * to indicate that the depth requested is relative to the client's
   * current shallow boundary, instead of relative to the requested
   * commits.
   *
   * Requires the "shallow" feature on the server
   *
   * @default false
   */
  deepenRelative?: boolean;
  /**
   * Requests that the shallow clone/fetch should be cut at a
   * specific time, instead of depth.  Internally it's equivalent to
   * doing "git rev-list --max-age=<timestamp>". Cannot be used with
   * "deepen".
   *
   * Requires the "shallow" feature on the server
   */
  deepenSince?: Date;
  /**
   * Requests that the shallow clone/fetch should be cut at a
   * specific revision specified by '<rev>', instead of a depth.
   * Internally it's equivalent of doing "git rev-list --not <rev>".
   * Cannot be used with "deepen", but can be used with
   * "deepen-since".
   *
   * Requires the "shallow" feature on the server
   */
  deepenNot?: readonly string[];

  /**
   * Request that various objects from the packfile be omitted
   * using one of several filtering techniques. These are intended
   * for use with partial clone and partial fetch operations.
   *
   * Requires the "filter" feature on the server
   */
  filter?: readonly ObjectFilter[];

  /**
   * Indicates to the server that the client wants to retrieve a
   * particular ref, where <ref> is the full name of a ref on the
   * server.
   *
   * Requires the "ref-in-want" feature on the server
   */
  wantRefs?: readonly string[];

  /**
   * Instruct the server to send the whole response multiplexed, not just
   * the packfile section. All non-flush and non-delim PKT-LINE in the
   * response (not only in the packfile section) will then start with a byte
   * indicating its sideband (1, 2, or 3), and the server may send "0005\2"
   * (a PKT-LINE of sideband 2 with no payload) as a keepalive packet.
   *
   * Requires the "sideband-all" feature on the server
   *
   * @default false
   */
  sidebandAll?: boolean;

  /**
   * Indicates to the server that the client is willing to receive
   * URIs of any of the given protocols in place of objects in the
   * sent packfile. Before performing the connectivity check, the
   * client should download from all given URIs. Currently, the
   * protocols supported are "http" and "https".
   *
   * Requires the "packfile-uris" feature on the server
   */
  packfileUriProtocols?: readonly string[];
}

enum FetchResponseEntryKind {
  Header,
  Progress,
  Error,
  Object,
}

type FetchResponseEntry =
  | FetchResponseEntryHeader
  | FetchResponseEntryProgress
  | FetchResponseEntryError
  | FetchResponseEntryObject;

interface FetchResponseEntryHeader {
  kind: FetchResponseEntryKind.Header;
  text: string;
}
interface FetchResponseEntryProgress {
  kind: FetchResponseEntryKind.Progress;
  text: string;
}
interface FetchResponseEntryError {
  kind: FetchResponseEntryKind.Error;
  text: string;
}
interface FetchResponseEntryObject {
  kind: FetchResponseEntryKind.Object;
  type: Type;
  hash: string;
  body: Uint8Array;
}

function fetchObjects(
  repoURL: URL,
  command: FetchCommand,
  ctx: ContextWithServerCapabilities,
): AsyncIterableIterator<FetchResponseEntry>;
```

Load a stream of objects for a repo
