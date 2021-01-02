export {sha1, Type, Mode} from '@es-git/core';

export {default as encodeObject, textToBlob} from './encodeObject';
export {default as decodeObject, blobToText} from './decodeObject';

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
