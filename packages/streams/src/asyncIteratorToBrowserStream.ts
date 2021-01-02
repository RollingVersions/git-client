export default function asyncIteratorToBrowserStream(
  iterator: AsyncIterableIterator<Uint8Array>,
  {highWaterMarkBytes = 10 * 1024}: {highWaterMarkBytes?: number} = {},
): ReadableStream<Uint8Array> | NodeJS.ReadableStream {
  return new ReadableStream<Uint8Array>(
    {
      async start() {},
      async pull(controller) {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
        } else {
          controller.enqueue(next.value);
        }
      },
      cancel() {
        iterator.return?.();
      },
    },
    new ByteLengthQueuingStrategy({highWaterMark: highWaterMarkBytes}),
  );
}
