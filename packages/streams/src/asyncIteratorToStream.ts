const asyncIteratorToBrowserStream = memoize(
  () => import('./asyncIteratorToBrowserStream'),
);
const asyncIteratorToNodeStream = memoize(
  () => import('./asyncIteratorToNodeStream'),
);
export default async function asyncIteratorToStream(
  iterator: AsyncIterableIterator<Uint8Array>,
  {highWaterMarkBytes = 10 * 1024}: {highWaterMarkBytes?: number} = {},
): Promise<ReadableStream<Uint8Array> | NodeJS.ReadableStream> {
  if (typeof ReadableStream !== 'undefined') {
    return (await asyncIteratorToBrowserStream()).default(iterator, {
      highWaterMarkBytes,
    });
  } else {
    return (await asyncIteratorToNodeStream()).default(iterator, {
      highWaterMarkBytes,
    });
  }
}

function memoize<T>(fn: () => T) {
  let result: {loaded: false} | {loaded: true; value: T} = {loaded: false};
  return (): T => {
    if (!result.loaded) {
      result = {loaded: true, value: fn()};
    }
    return result.value;
  };
}
