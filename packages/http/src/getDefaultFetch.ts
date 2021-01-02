import fetch, {Headers} from 'cross-fetch';
import {
  asyncIteratorToStream,
  streamToAsyncIterator,
} from '@rollingversions/git-streams';
import FetchInterface from './FetchInterface';

const getDefaultFetch = (options: {[key: string]: any}): FetchInterface => ({
  createHeaders: () => new Headers(),
  get: async function* (url, headers) {
    const response = await fetch(url.href, {...options, headers});
    if (!response.ok) {
      throw new Error(
        `Server responded to ${url.href} with status code ${
          response.status
        }: ${await response.text()}`,
      );
    }
    if (response.body) {
      for await (const chunk of streamToAsyncIterator(response.body)) {
        yield chunk;
      }
    } else {
      yield new Uint8Array(await response.arrayBuffer());
    }
  },
  post: async function* (url, headers, body) {
    const response = await fetch(url.href, {
      ...options,
      method: 'POST',
      headers,
      // @ts-expect-error - on NodeJS this is a NodeJS stream, in the browser it is a browser stream
      body: await asyncIteratorToStream(body),
    });
    if (!response.ok) {
      console.error(
        `Server responded to ${url.href} with status code ${response.status}`,
      );
      throw new Error(
        `Server responded to ${url.href} with status code ${
          response.status
        }: ${await response.text()}`,
      );
    }
    if (response.body) {
      for await (const chunk of streamToAsyncIterator(response.body)) {
        yield chunk;
      }
    } else {
      yield new Uint8Array(await response.arrayBuffer());
    }
  },
});

export default getDefaultFetch;
