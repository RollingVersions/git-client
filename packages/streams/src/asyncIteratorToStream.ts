import asyncIteratorToBrowserStream from './asyncIteratorToBrowserStream';
import asyncIteratorToNodeStream from './asyncIteratorToNodeStream';

export default function asyncIteratorToStream(
  iterator: AsyncIterableIterator<Uint8Array>,
  {highWaterMarkBytes = 10 * 1024}: {highWaterMarkBytes?: number} = {},
): ReadableStream<Uint8Array> | NodeJS.ReadableStream {
  if (typeof ReadableStream !== 'undefined') {
    return asyncIteratorToBrowserStream(iterator, {
      highWaterMarkBytes,
    });
  } else {
    return asyncIteratorToNodeStream(iterator, {
      highWaterMarkBytes,
    });
  }
}
