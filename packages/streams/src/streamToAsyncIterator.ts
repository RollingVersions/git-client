import defer from './defer';

export default function streamToAsyncIterator(
  readable: NodeJS.ReadableStream | ReadableStream<Uint8Array>,
): AsyncIterableIterator<Uint8Array> {
  const reader = isBrowser(readable)
    ? readable.getReader()
    : toReader(readable);
  return {
    async next() {
      const result = await reader.read();
      return result.done
        ? {done: true, value: undefined}
        : {done: false, value: result.value ?? new Uint8Array(0)};
    },
    async return() {
      await reader.cancel();
      return {done: true, value: undefined};
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

function toReader(
  stream: NodeJS.ReadableStream,
): Pick<ReadableStreamDefaultReader<Uint8Array>, 'read' | 'cancel'> {
  let readable = defer<boolean>();
  const onEnd = new Promise<boolean>((res) =>
    stream.on('end', () => res(true)),
  );
  stream.on('readable', () => readable.resolve(false));
  let isDone = false;
  return {
    async read(): Promise<{done: false; value: Uint8Array} | {done: true}> {
      let value = stream.read() as Buffer | null;
      while (value === null) {
        readable = defer<boolean>();
        const done = await Promise.race([onEnd, readable.promise]);
        if (done) {
          isDone = true;
          return {done};
        }
        value = stream.read() as Buffer;
      }

      return {
        done: false,
        value: new Uint8Array(
          value.buffer.slice(
            value.byteOffset,
            value.byteOffset + value.byteLength,
          ),
        ),
      };
    },
    async cancel() {
      if (!isDone) {
        if (typeof (stream as any).destroy === 'function') {
          (stream as any).destroy();
        } else {
          stream.resume();
        }
      }
    },
  };
}

function isBrowser(
  body: ReadableStream | NodeJS.ReadableStream,
): body is ReadableStream {
  return 'getReader' in body;
}
