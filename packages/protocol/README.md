# @rollingversions/git-protocol

Low level streaming parsers & serializers for [git protocol-v2](https://git-scm.com/docs/protocol-v2) and [git pack-protocol](https://git-scm.com/docs/pack-protocol) (see also: [protocol-common](https://git-scm.com/docs/protocol-common)).

Git terminology can be confusing. I have attempted to match the git internal names where possible, so it's easier to compare with the relevant part of the git docs. The most important thing to note is that everything is from the perspective of the server, not the client, so an "upload request" is a request sent from the client to the server that asks the server to "upload" data to the client. This is what is sent by "fetch" or "pull" commands

## API

### Capabilities

`Capabilities` are used to communicate the capabilities supported by either the server or the client. They are represented as a `Map<string, string | boolean>`.

### parseInitialResponse

```ts
function parseInitialResponse(
  response: AsyncIterableIterator<Uint8Array>,
): Promise<Capabilities>;
```

Parse the response to calling `GET https://example.com/example-repo.git/info/refs?service=git-upload-pack`
