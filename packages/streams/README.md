# @rollingversions/git-streams

Helpers for dealing with various forms of binary & object streams, using `AsyncIterator` as the canonical format.

## streamToAsyncIterator

```ts
function streamToAsyncIterator(
  readable: NodeJS.ReadableStream | ReadableStream<Uint8Array>,
): AsyncIterableIterator<Uint8Array>;
```

Convert a binary `NodeJS.ReadableStream` or a browser `ReadableStream<Uint8Array>` into an `AsyncIterableIterator<Uint8Array>`

## asyncIteratorToNodeStream

```ts
function asyncIteratorToNodeStream(
  iterator: AsyncIterableIterator<Uint8Array>,
  options?: {
    highWaterMarkBytes?: number;
  },
): NodeJS.ReadableStream;
```

Convert a `AsyncIterableIterator<Uint8Array>` into a binary `NodeJS.ReadableStream`

## asyncIteratorToBrowserStream

```ts
function asyncIteratorToBrowserStream(
  iterator: AsyncIterableIterator<Uint8Array>,
  options?: {highWaterMarkBytes?: number},
): ReadableStream<Uint8Array>;
```

Convert a `AsyncIterableIterator<Uint8Array>` into a binary `ReadableStream<Uint8Array>`

## asyncIteratorToStream

```ts
function asyncIteratorToStream(
  iterator: AsyncIterableIterator<Uint8Array>,
  options?: {highWaterMarkBytes?: number},
): ReadableStream<Uint8Array> | NodeJS.ReadableStream;
```

If `ReadableStream` exists (i.e. in the browser), call `asyncIteratorToBrowserStream`, otherwise call `asyncIteratorToNodeStream`.

## asyncIteratorToBuffer

```ts
function asyncIteratorToBuffer(
  iterator: AsyncIterableIterator<Uint8Array>,
): Promise<Uint8Array>;
```

Gather all the data from an `AsyncIterableIterator<Uint8Array>` into a single concatenated `Uint8Array`.

## asyncIteratorToArray

```ts
function asyncIteratorToArray<T>(
  iterator: AsyncIterableIterator<T>,
): Promise<T[]>;
```

Collect all the values in an `AsyncIterableIterator` of objects into an array.

## mergeAsyncIterator

```ts
function mergeAsyncIterator<TInput>(
  ...iterators: AsyncIterableIterator<TInput>[]
): AsyncIterableIterator<TInput>;
```

Take a list of `AsyncIterableIterator` and merge them into a single one that returns the union of all values, interleaved in whatever order they are returned.

## splitAsyncIterator

```ts
function splitAsyncIterator<TInput, TOutput extends any[]>(
  iterator: AsyncIterableIterator<TInput>,
  ...mappers: {
    [key in keyof TOutput]: (v: TInput) => undefined | TOutput[key];
  }
): {
  [key in keyof TOutput]: AsyncIterableIterator<TOutput[key]>;
};
```

Take an `AsyncIterableIterator` and split the values into multiple separate streams according to a filtering/mapping function. N.B. you must consume values from all returned `AsyncIterableIterator`s otherwise the others will stall.
