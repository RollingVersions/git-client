import {Type, Mode} from '@es-git/core';

export type Hash = string;

export type SecondsWithOffset = {
  readonly seconds: number;
  readonly offset: number;
};

export type Person = {
  readonly name: string;
  readonly email: string;
  readonly date: Date | SecondsWithOffset;
};

export type ModeHash = {
  readonly mode: Mode;
  readonly hash: string;
};

export type BlobObject = {
  readonly type: Type.blob;
  readonly body: Uint8Array;
};

export type TreeObject = {
  readonly type: Type.tree;
  readonly body: TreeBody;
};

export type TreeBody = {
  [key: string]: ModeHash;
};

export type CommitObject = {
  readonly type: Type.commit;
  readonly body: CommitBody;
};

export type CommitBody = {
  readonly tree: string;
  readonly parents: string[];
  readonly author: Person;
  readonly committer: Person;
  readonly message: string;
};

export type TagObject = {
  readonly type: Type.tag;
  readonly body: TagBody;
};

export type TagBody = {
  readonly object: string;
  readonly type: string;
  readonly tag: string;
  readonly tagger: Person;
  readonly message: string;
};

export type Body = Uint8Array | TreeBody | CommitBody | TagBody;
export type GitObject = BlobObject | TreeObject | CommitObject | TagObject;
