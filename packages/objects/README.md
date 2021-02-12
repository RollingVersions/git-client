# @rollingversions/git-objects

Core types and helpers for managing git objects.

## Helpers

### sha1

```ts
function sha1(buffer: Uint8Array): string;
```

Generate a sha1 hash from a Uint8Array

### encodeObject

```ts
function encodeObject(object: GitObject): Uint8Array;
```

Convert a `GitObject` into an un-compressed `Uint8Array`

### decodeObject

```ts
function objectIsBlob(buffer: Uint8Array): buffer is BinaryObject<Type.blob>;
function objectIsCommit(
  buffer: Uint8Array,
): buffer is BinaryObject<Type.commit>;
function objectIsTag(buffer: Uint8Array): buffer is BinaryObject<Type.tag>;
function objectIsTree(buffer: Uint8Array): buffer is BinaryObject<Type.tree>;

function decodeObject(buffer: BinaryObject<Type.blob>): BlobObject;
function decodeObject(buffer: BinaryObject<Type.commit>): CommitObject;
function decodeObject(buffer: BinaryObject<Type.tag>): TagObject;
function decodeObject(buffer: BinaryObject<Type.tree>): TreeObject;
function decodeObject(buffer: Uint8Array): GitObject;
```

Convert an un-compressed `Uint8Array` into a `GitObject`

## Types

### Type

```ts
export enum Type {
  unknown = 'unknown',
  commit = 'commit',
  tree = 'tree',
  blob = 'blob',
  tag = 'tag',
}
```

The type of a git object
