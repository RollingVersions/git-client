import {decode, encode} from '@rollingversions/git-core';
import {
  printPktLine,
  parsePktLines,
  isSpecialPacket,
  SpecialPacketLine,
} from './PktLines';

test('printPktLine', () => {
  expect(decode(printPktLine(SpecialPacketLine.FlushPacket))).toBe('0000');
  expect(decode(printPktLine(SpecialPacketLine.DelimiterPacket))).toBe('0001');
  expect(decode(printPktLine(SpecialPacketLine.MessagePacket))).toBe('0002');
  expect(decode(printPktLine('\n'))).toBe('0005\n');
  expect(decode(printPktLine(encode('\n')))).toBe('0005\n');
  expect(decode(printPktLine('hi\n'))).toBe('0007hi\n');
  expect(decode(printPktLine(encode('hi\n')))).toBe('0007hi\n');
});

test('parsePktLines', async () => {
  const results: any[] = [];
  for await (const line of parsePktLines(
    (async function* () {
      yield encode('0007hi\n');
      yield encode('0000');
      yield encode('0001');
      yield encode('0002');
      yield encode('0009hello');
    })(),
  )) {
    if (isSpecialPacket(line)) {
      results.push(line);
    } else {
      results.push(await line.toString());
    }
  }
  expect(results).toEqual([
    'hi',
    SpecialPacketLine.FlushPacket,
    SpecialPacketLine.DelimiterPacket,
    SpecialPacketLine.MessagePacket,
    'hello',
  ]);
});
