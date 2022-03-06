export enum GitObjectTypeID {
  commit = 1,
  tree = 2,
  blob = 3,
  tag = 4,
  // ofsDelta = 6,
  // refDelta = 7,
}
export enum GitObjectType {
  commit = 'commit',
  tree = 'tree',
  blob = 'blob',
  tag = 'tag',
}

export interface PackfileEntry {
  readonly type: GitObjectTypeID;
  readonly offset: number;
  readonly body: Buffer;
}

export interface GitRawObject {
  readonly type: GitObjectType;
  readonly hash: string;
  readonly body: Uint8Array;
}
