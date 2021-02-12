import splitAsyncIterator from './splitAsyncIterator';

async function delayRandom() {
  await new Promise((resolve) =>
    setTimeout(resolve, Math.floor(50 * Math.random())),
  );
}
async function collect<T>(iterator: AsyncIterableIterator<T>, limit: number) {
  const result: T[] = [];
  let index = 0;
  for await (const v of iterator) {
    index++;
    await delayRandom();
    result.push(v);
    if (index >= limit) {
      break;
    }
  }
  return result;
}
test('splitAsyncIterator', async () => {
  async function* listValues() {
    yield 1;
    await delayRandom();
    yield 2;
    yield 3;
    await delayRandom();
    yield 'a';
    yield true;
    yield 4;
    await delayRandom();
    yield 5;
    yield null;
    yield 'b';
    await delayRandom();
    yield 'c';
    await delayRandom();
    yield false;
    yield 'd';
    await delayRandom();
    yield 6;
    await delayRandom();
    yield 'e';
    yield 'f';
    yield 'g';
    throw new Error(`We don't consume this many entries`);
  }
  const [strings, numbers] = splitAsyncIterator(
    listValues(),
    (v) => (typeof v === 'string' ? v : undefined),
    (v) => (typeof v === 'number' ? v : undefined),
  );
  const [stringsList, numbersList] = await Promise.all([
    collect(strings, 7),
    collect(numbers, 5),
  ]);
  expect(stringsList).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  expect(numbersList).toEqual([1, 2, 3, 4, 5]);
});
