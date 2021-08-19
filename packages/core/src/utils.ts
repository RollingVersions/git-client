const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const NEWLINE = '\n'.charCodeAt(0);

export function encode(text: string) {
  return encoder.encode(text);
}

export function decode(binary: Uint8Array, start = 0, end = binary.length) {
  if (start !== 0 || end !== binary.length) {
    return decoder.decode(binary.subarray(start, end));
  } else {
    return decoder.decode(binary);
  }
}

export function concat(...arrays: (Uint8Array | number[])[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

export function fromHex(binary: Uint8Array) {
  let size = 0;
  for (let i = 0; i < 4; i++) {
    size = (size << 4) | fromHexChar(binary[i]);
  }
  return size;
}

export function fromHexChar(val: number) {
  return val < 0x57 ? val - 0x30 : val - 0x57;
}

export function fromDec(buffer: Uint8Array, start: number, end: number) {
  let val = 0;
  while (start < end) {
    val = val * 10 + fromDecChar(buffer[start++]);
  }
  return val;
}

export function fromDecChar(val: number) {
  return val - 0x30;
}

export function fromOct(
  buffer: Uint8Array,
  start: number,
  end: number,
): number {
  let val = 0;
  while (start < end) {
    val = (val << 3) + fromDecChar(buffer[start++]);
  }
  return val;
}

export function toHexChar(val: number) {
  return val < 10 ? val + 0x30 : val + 0x57;
}
