import HttpDefault from './HttpDefault';
import initialRequest from './initialRequest';
import lsRefs from './lsRefs';
import fetchObjects from './fetchObjects';

export type {
  default as Context,
  ContextWithServerCapabilities,
} from './Context';

export type {default as HttpInterface} from './HttpInterface';

export const Http = HttpDefault({});

export {initialRequest};
export {lsRefs};
export {fetchObjects};

export {
  blobNone,
  blobLimit,
  treeDepth,
  FetchResponseEntryKind,
} from '@rollingversions/git-protocol';

export async function collect<T>(
  iterator: AsyncIterableIterator<T>,
): Promise<T[]> {
  const result: T[] = [];
  for await (const value of iterator) {
    result.push(value);
  }
  return result;
}
