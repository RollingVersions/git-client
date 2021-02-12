export default interface HttpInterface<
  THeaders extends {set(name: string, value: string): unknown}
> {
  createHeaders(url: URL): THeaders;
  get(url: URL, headers: THeaders): AsyncIterableIterator<Uint8Array>;
  post(
    url: URL,
    headers: THeaders,
    body: AsyncIterableIterator<Uint8Array>,
  ): AsyncIterableIterator<Uint8Array>;
}
