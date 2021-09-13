export interface HttpResponse {
  url: URL;
  statusCode: number;
  body: NodeJS.ReadableStream;
}
export default interface HttpInterface<
  THeaders extends {set(name: string, value: string): unknown}
> {
  createHeaders(url: URL): THeaders;
  get(url: URL, headers: THeaders): Promise<HttpResponse>;
  post(
    url: URL,
    headers: THeaders,
    body: NodeJS.ReadableStream,
  ): Promise<HttpResponse>;
}
