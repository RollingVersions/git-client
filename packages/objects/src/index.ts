export {Type, Mode} from '@rollingversions/git-core';

export {default as encodeObject, textToBlob} from './encodeObject';
export {
  default as decodeObject,
  blobToText,
  objectIsBlob,
  objectIsCommit,
  objectIsTag,
  objectIsTree,
} from './decodeObject';

export type {
  Hash,
  SecondsWithOffset,
  Person,
  ModeHash,
  BlobObject,
  TreeObject,
  TreeBody,
  CommitObject,
  CommitBody,
  TagObject,
  TagBody,
  Body,
  GitObject,
} from './types';
