export default async function asyncIteratorToBuffer(
  iterator: AsyncIterableIterator<Uint8Array>,
): Promise<Uint8Array> {
  const body: Uint8Array[] = [];
  for await (const chunk of iterator) {
    body.push(chunk);
  }
  return concat(...body);
}

export function concat(...arrays: Uint8Array[]) {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
