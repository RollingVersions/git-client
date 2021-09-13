import {decode, encode} from '@rollingversions/git-core';
import {
  printPktLine,
  isSpecialPacket,
  SpecialPacketLine,
  PacketLineParser,
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

test('PacketLineParser', async () => {
  const input = Buffer.from(
    [
      '0007hi\n',
      '0000',
      '0001',
      '0002',
      '0009hello',
      '0009hello',
      '0009hello',
      '0009hello',
      '0009hello',
    ].join(``),
  );
  const expectedOutput = [
    'hi',
    SpecialPacketLine.FlushPacket,
    SpecialPacketLine.DelimiterPacket,
    SpecialPacketLine.MessagePacket,
    'hello',
    'hello',
    'hello',
    'hello',
    'hello',
  ];
  for (let chunkSize = 1; chunkSize < input.length + 1; chunkSize++) {
    const results = await new Promise<any[]>((resolve, reject) => {
      const lines: any[] = [];
      const parser = new PacketLineParser();
      parser
        .on(`data`, (line) => {
          if (isSpecialPacket(line)) {
            lines.push(line);
          } else {
            lines.push(line.toString(`utf8`).replace(/\n$/, ``));
          }
        })
        .on(`error`, reject)
        .on(`end`, () => resolve(lines));
      for (let i = 0; i < input.length; i += chunkSize) {
        parser.write(input.slice(i, i + chunkSize));
      }
      parser.end();
    });
    expect(results).toEqual(expectedOutput);
  }
});
// test('PacketLineParser - Stream', async () => {
//   const input = Buffer.from(
//     ['0007hi\n', '0000', '0001', '0002', '0009hello'].join(``),
//   );
//   const expectedOutput = `hi\nhello`;
//   for (let chunkSize = 1; chunkSize < input.length + 1; chunkSize++) {
//     const result = await new Promise<Buffer>((resolve, reject) => {
//       const chunks: Buffer[] = [];
//       const parser = new PacketLineParser({mode: 'stream'});
//       parser
//         .on(`data`, (chunk) => chunks.push(chunk))
//         .on(`error`, reject)
//         .on(`end`, () => resolve(Buffer.concat(chunks)));
//       for (let i = 0; i < input.length; i += chunkSize) {
//         parser.write(input.slice(i, i + chunkSize));
//       }
//       parser.end();
//     });
//     expect(result.toString(`utf8`)).toEqual(expectedOutput);
//   }
// });
