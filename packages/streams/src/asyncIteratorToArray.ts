export default async function asyncIteratorToArray<T>(
  iterator: AsyncIterableIterator<T>,
): Promise<T[]> {
  const result: T[] = [];
  for await (const value of iterator) {
    result.push(value);
  }
  return result;
}
