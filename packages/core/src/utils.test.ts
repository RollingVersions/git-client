import {toHexChar} from './utils';

for (const [num, hexChar] of [
  [0, '0'],
  [1, '1'],
  [9, '9'],
  [10, 'a'],
  [15, 'f'],
] as const) {
  test(`toHexChar(${num}) => ${hexChar}`, () => {
    expect(String.fromCharCode(toHexChar(num))).toBe(hexChar);
  });
}
