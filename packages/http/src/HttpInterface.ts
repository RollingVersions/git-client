export default interface HttpInterface {
  createHeaders(url: URL): Headers;
  get(url: URL, headers: Headers): AsyncIterableIterator<Uint8Array>;
  post(
    url: URL,
    headers: Headers,
    body: AsyncIterableIterator<Uint8Array>,
  ): AsyncIterableIterator<Uint8Array>;
}
