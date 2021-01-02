import {Readable} from 'stream';
import streamToAsyncIterator from './streamToAsyncIterator';

const expected = new Uint8Array(500_000);
for (let i = 0; i < expected.length; i++) {
  expected[i] = Math.floor(Math.random() * 200);
}

test('streamToAsyncIterator - node', async () => {
  let streamIndex = 0;
  const stream = new Readable({
    read(size) {
      const chunkSize = Math.min(size, expected.length - streamIndex);
      this.push(new Uint8Array(expected.buffer, streamIndex, chunkSize));
      streamIndex += chunkSize;
      if (streamIndex >= expected.length) {
        this.push(null);
      }
    },
  });
  let pos = 0;
  for await (const chunk of streamToAsyncIterator(stream)) {
    expect(chunk.buffer).toEqual(
      expected.buffer.slice(pos, pos + chunk.length),
    );
    pos += chunk.length;
    if (pos > 200_000) {
      break;
    }
  }
  expect(stream.destroyed).toBe(true);
});

test('streamToAsyncIterator - browser', async () => {
  let streamIndex = 0;
  let requestCancelled = false;
  const stream = {
    getReader() {
      return {
        read() {
          if (streamIndex >= expected.length) {
            return {done: true};
          }
          const chunkSize = 10_000;
          const result = new Uint8Array(
            expected.buffer,
            streamIndex,
            chunkSize,
          );
          streamIndex += chunkSize;
          return {done: false, value: result};
        },
        cancel() {
          requestCancelled = true;
        },
      };
    },
  };
  let pos = 0;
  for await (const chunk of streamToAsyncIterator(stream as any)) {
    expect(chunk.buffer).toEqual(
      expected.buffer.slice(pos, pos + chunk.length),
    );
    pos += chunk.length;
    if (pos > 200_000) {
      break;
    }
  }
  expect(requestCancelled).toBe(true);
});
