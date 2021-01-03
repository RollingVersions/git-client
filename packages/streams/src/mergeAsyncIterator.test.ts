import defer from './defer';
import mergeAsyncIterator from './mergeAsyncIterator';

const delayResolvers = Array.from({length: 9}).map(() => ({
  before: defer(),
  after: defer(),
}));
async function delay(order: number) {
  delayResolvers[order].before.resolve();
  await delayResolvers[order].after.promise;
}
async function collect<T>(iterator: AsyncIterableIterator<T>) {
  const result: T[] = [];
  for await (const v of iterator) {
    result.push(v);
  }
  return result;
}
async function runDelayed() {
  for (const {before, after} of delayResolvers) {
    await before.promise;
    await new Promise((r) => {
      setTimeout(r, 100);
    });
    after.resolve();
  }
}
test('mergeAsyncIterator', async () => {
  async function* listStrings() {
    await delay(0);
    yield 'a';
    await delay(2);
    yield 'b';
    await delay(4);
    yield 'c';
    await delay(6);
    yield 'd';
    await delay(8);
    yield 'e';
    yield 'f';
    yield 'g';
  }

  async function* listNumbers() {
    yield 1;
    await delay(1);
    yield 2;
    yield 3;
    await delay(3);
    yield 4;
    await delay(5);
    yield 5;
    await delay(7);
    yield 6;
  }

  runDelayed();

  const results = await collect(
    mergeAsyncIterator<number | string>(listStrings(), listNumbers()),
  );

  expect(results).toEqual([
    1,
    'a',
    2,
    3,
    'b',
    4,
    'c',
    5,
    'd',
    6,
    'e',
    'f',
    'g',
  ]);
});
