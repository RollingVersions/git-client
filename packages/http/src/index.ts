import getDefaultFetch from './getDefaultFetch';
import FetchInterface from './FetchInterface';
import initialRequest from './initialRequest';
import lsRefs from './lsRefs';

export type {FetchInterface};

export const Fetch = getDefaultFetch({});

export {initialRequest};
export {lsRefs};

export async function collect<T>(
  iterator: AsyncIterableIterator<T>,
): Promise<T[]> {
  const result: T[] = [];
  for await (const value of iterator) {
    result.push(value);
  }
  return result;
}
