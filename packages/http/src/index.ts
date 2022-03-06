import HttpDefault from './createHttpHandler';
import initialRequest from './initialRequest';
import lsRefs from './lsRefs';
import fetchObjects, {fetchObjectsV2} from './fetchObjects';

export type {
  default as Context,
  ContextWithServerCapabilities,
} from './Context';

export type {default as HttpInterface} from './HttpInterface';

export const DEFAULT_HTTP_HANDLER = HttpDefault({});

export type {
  FetchCommand,
  FetchResponseEntryObject,
} from '@rollingversions/git-protocol';

export {blobNone, blobLimit, treeDepth} from '@rollingversions/git-protocol';

export {initialRequest};
export {lsRefs};
export {fetchObjects, fetchObjectsV2};
