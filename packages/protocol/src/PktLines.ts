// https://git-scm.com/docs/protocol-common
import {
  AsyncBuffer,
  fromHex,
  toHexChar,
  concat,
  encode,
  decode,
} from '@rollingversions/git-core';

export enum SpecialPacketLine {
  /**
   * 0000 Flush Packet (flush-pkt) - indicates the end of a message
   */
  FlushPacket = 0,
  /**
   * 0001 Delimiter Packet (delim-pkt) - separates sections of a message
   */
  DelimiterPacket = 1,
  /**
   * 0002 Message Packet (response-end-pkt) - indicates the end of a response for stateless connections
   */
  MessagePacket = 2,
}

const SpecialPacketLineEncoded = {
  [SpecialPacketLine.FlushPacket]: encode('0000'),
  [SpecialPacketLine.DelimiterPacket]: encode('0001'),
  [SpecialPacketLine.MessagePacket]: encode('0002'),
};

export type PacketLine = string | Uint8Array | SpecialPacketLine;

export interface NormalParsedPacketLine {
  readonly peek: () => Promise<number>;
  readonly toString: () => Promise<string>;
  readonly toBuffer: () => Promise<Uint8Array>;
  readonly stream: () => AsyncBuffer;
}
export type ParsedPacketLine = NormalParsedPacketLine | SpecialPacketLine;

export function isSpecialPacket(pkt: unknown): pkt is SpecialPacketLine {
  return (
    pkt === SpecialPacketLine.FlushPacket ||
    pkt === SpecialPacketLine.DelimiterPacket ||
    pkt === SpecialPacketLine.MessagePacket
  );
}

// A non-binary line SHOULD BE terminated by an LF, which if present MUST be included
// in the total length. Receivers MUST treat pkt-lines with non-binary data the same
// whether or not they contain the trailing LF (stripping the LF if present, and not
// complaining when it is missing).

export function printPktLine(line: PacketLine): Uint8Array {
  if (isSpecialPacket(line)) {
    return SpecialPacketLineEncoded[line];
  }
  if (typeof line === 'string') {
    return printPktLine(encode(line));
  }

  // The first four bytes of the line, the pkt-len, indicates the total length
  // of the line, in hexadecimal. The pkt-len includes the 4 bytes used to contain
  // the length’s hexadecimal representation.
  const buffer = new Uint8Array(4 + line.length);
  buffer[0] = toHexChar(buffer.length >>> 12);
  buffer[1] = toHexChar((buffer.length >>> 8) & 0xf);
  buffer[2] = toHexChar((buffer.length >>> 4) & 0xf);
  buffer[3] = toHexChar(buffer.length & 0xf);

  buffer.set(line, 4);

  return buffer;
}
export function packetLinePrinter<TArgs extends any[]>(
  fn: (...args: TArgs) => AsyncIterableIterator<PacketLine>,
): (...args: TArgs) => AsyncIterableIterator<Uint8Array> {
  return async function* (...args) {
    for await (const line of fn(...args)) {
      yield printPktLine(line);
    }
  };
}
export function packetLineParser<TArgs extends any[], TResult>(
  fn: (
    response: AsyncIterableIterator<ParsedPacketLine>,
    ...args: TArgs
  ) => TResult,
): (response: AsyncIterableIterator<Uint8Array>, ...args: TArgs) => TResult {
  return (response, ...args) => fn(parsePktLines(response), ...args);
}

export async function* parsePktLines(
  response: AsyncIterableIterator<Uint8Array>,
) {
  const buffer = new AsyncBuffer(response);

  while (!(await buffer.isDone())) {
    yield await unpktLine(buffer);
  }
}

async function unpktLine(line: AsyncBuffer): Promise<ParsedPacketLine> {
  const size = fromHex(await line.next(4));
  if (size === 0) {
    return SpecialPacketLine.FlushPacket;
  }
  if (size === 1) {
    return SpecialPacketLine.DelimiterPacket;
  }
  if (size === 2) {
    return SpecialPacketLine.MessagePacket;
  }
  const stream = new AsyncBuffer(line.rest(size - 4));
  return {
    peek: () => stream.peek(),
    toString: async () => {
      const str = decode(await consume(stream.rest()));
      if (str.endsWith('\n')) {
        return str.substr(0, str.length - 1);
      } else {
        return str;
      }
    },
    toBuffer: () => consume(stream.rest()),
    stream: () => stream,
  };
}

async function consume(stream: AsyncIterableIterator<Uint8Array>) {
  const result: Uint8Array[] = [];
  for await (const chunk of stream) {
    result.push(chunk);
  }
  return concat(...result);
}
