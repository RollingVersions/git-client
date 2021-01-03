export default function mergeAsyncIterator<TInput>(
  iterator: AsyncIterableIterator<TInput>,
  ...iterators: AsyncIterableIterator<TInput>[]
): AsyncIterableIterator<TInput> {
  const allIterators = [iterator, ...iterators];
  let values:
    | Map<number, Promise<{result: IteratorResult<TInput, any>; index: number}>>
    | undefined;
  return {
    async next() {
      if (!values) {
        values = new Map(
          allIterators.map((iter, index) => [
            index,
            iter.next().then((result) => ({result, index})),
          ]),
        );
      }
      while (true) {
        const {result, index} = await Promise.race([...values.values()]);
        if (result.done) {
          values.delete(index);
          if (!values.size) {
            return {done: true, value: undefined};
          }
        } else {
          values.set(
            index,
            allIterators[index].next().then((result) => ({result, index})),
          );
          return result;
        }
      }
    },
    async return() {
      await Promise.all(allIterators.map((iter) => iter.return?.()));
      return {done: true, value: undefined};
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
