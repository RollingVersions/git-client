import {Readable} from 'stream';

export default function asyncIteratorToNodeStream(
  iterator: AsyncIterableIterator<Uint8Array>,
  {highWaterMarkBytes = 10 * 1024}: {highWaterMarkBytes?: number} = {},
): ReadableStream<Uint8Array> | NodeJS.ReadableStream {
  return new Readable({
    highWaterMark: highWaterMarkBytes,
    async read() {
      try {
        for await (const value of unbreakable(iterator)) {
          if (!this.push(value)) return;
        }

        this.push(null);
      } catch (ex) {
        this.emit('error', ex);
      }
    },
  });
}

function unbreakable<T>(iterator: AsyncIterableIterator<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      return {
        next() {
          return iterator.next();
        },
      };
    },
  };
}
