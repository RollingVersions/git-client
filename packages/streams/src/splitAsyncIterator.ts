import defer from './defer';

export default function splitAsyncIterator<TInput, TOutput extends any[]>(
  iterator: AsyncIterableIterator<TInput>,
  ...mappers: {
    [key in keyof TOutput]: (v: TInput) => undefined | TOutput[key];
  }
): {
  [key in keyof TOutput]: AsyncIterableIterator<TOutput[key]>;
} {
  let unReturned = new Set(mappers.map((_, i) => i));
  let ready = mappers.map(() => defer());
  let nextValue = defer<IteratorResult<TInput, unknown>>();
  const iter = iterator[Symbol.asyncIterator]();
  async function pull() {
    while (true) {
      await Promise.all(
        ready.map(({promise}, index) =>
          unReturned.has(index) ? promise : null,
        ),
      );
      ready = mappers.map(() => defer());
      const nextValueToResolve = nextValue;
      nextValue = defer();
      if (unReturned.size) {
        nextValueToResolve.resolve(iter.next());
      } else {
        unReturned = new Set(mappers.map((_, i) => i));
        nextValueToResolve.resolve(
          iter.return ? iter.return() : {done: true, value: undefined},
        );
      }
    }
  }
  pull();

  return mappers.map(
    <T>(
      mapper: (input: TInput) => T | undefined,
      index: number,
    ): AsyncIterableIterator<T> => {
      return {
        async next() {
          let value: T | undefined;
          while (value === undefined) {
            const nextValuePromise = nextValue.promise;
            ready[index].resolve();
            const res = await nextValuePromise;
            if (res.done) {
              return {done: true, value: undefined};
            }
            value = mapper(res.value);
          }
          return {done: false, value};
        },
        async return() {
          unReturned.delete(index);
          return this.next();
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
    },
  ) as any;
}
