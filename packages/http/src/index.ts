import {asyncIteratorToArray} from '@rollingversions/git-streams';
import HttpDefault from './createHttpHandler';
import initialRequest from './initialRequest';
import lsRefs from './lsRefs';
import fetchObjects from './fetchObjects';

export type {
  default as Context,
  ContextWithServerCapabilities,
} from './Context';

export type {default as HttpInterface} from './HttpInterface';

export const DEFAULT_HTTP_HANDLER = HttpDefault({});

export type {
  FetchCommand,
  FetchResponseEntry,
  FetchResponseEntryHeader,
  FetchResponseEntryProgress,
  FetchResponseEntryError,
  FetchResponseEntryObject,
} from '@rollingversions/git-protocol';

export {
  blobNone,
  blobLimit,
  treeDepth,
  FetchResponseEntryKind,
} from '@rollingversions/git-protocol';

export {initialRequest};
export {lsRefs};
export {fetchObjects};

export {asyncIteratorToArray};
