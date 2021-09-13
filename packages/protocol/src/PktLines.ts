// https://git-scm.com/docs/protocol-common
import {fromHex, toHexChar, encode} from '@rollingversions/git-core';
import {Transform} from 'stream';

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
  [SpecialPacketLine.FlushPacket]: Buffer.from('0000'),
  [SpecialPacketLine.DelimiterPacket]: Buffer.from('0001'),
  [SpecialPacketLine.MessagePacket]: Buffer.from('0002'),
};

export type PacketLine = string | Uint8Array | SpecialPacketLine;

export type NormalParsedPacketLine = Buffer;
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

export function printPktLine(line: PacketLine): Buffer {
  if (isSpecialPacket(line)) {
    return SpecialPacketLineEncoded[line];
  }
  if (typeof line === 'string') {
    return printPktLine(encode(line));
  }

  // The first four bytes of the line, the pkt-len, indicates the total length
  // of the line, in hexadecimal. The pkt-len includes the 4 bytes used to contain
  // the length’s hexadecimal representation.
  const buffer = Buffer.alloc(4 + line.length);
  buffer[0] = toHexChar(buffer.length >>> 12);
  buffer[1] = toHexChar((buffer.length >>> 8) & 0xf);
  buffer[2] = toHexChar((buffer.length >>> 4) & 0xf);
  buffer[3] = toHexChar(buffer.length & 0xf);

  buffer.set(line, 4);

  return buffer;
}

/**
 * In "stream" mode, the output is a binary stream containing all the data
 * in the normal packet lines concatenated into a single stream. Events are
 * emitted for:
 *  - flush_packet
 *  - delimiter_packet
 *  - message_packet
 *
 * In "line" mode, the output consists of a mix of values from the
 * SpecialPacketLine enum, and `Buffer` objects representing a single
 * normal packet line.
 */
export class PacketLineParser extends Transform {
  constructor() {
    let remainingOnLine = 0;
    let buffer: Buffer[] = [];
    const transform = (chunk: Buffer) => {
      if (remainingOnLine !== 0) {
        // Buffering a line
        if (remainingOnLine > chunk.length) {
          remainingOnLine -= chunk.length;
          buffer.push(chunk);
          return;
        }

        buffer.push(chunk.slice(0, remainingOnLine));
        this.push(Buffer.concat(buffer));
        const rest = chunk.slice(remainingOnLine);
        buffer = [];
        remainingOnLine = 0;
        transform(rest);
      } else {
        // parsing header (4 bytes)
        buffer.push(chunk);
        const buf = Buffer.concat(buffer);
        if (buf.length < 4) {
          return;
        }
        buffer = [];
        const size = fromHex(buf.slice(0, 4));
        if (size === 0) {
          this.push(SpecialPacketLine.FlushPacket);
          transform(buf.slice(4));
          return;
        }
        if (size === 1) {
          this.push(SpecialPacketLine.DelimiterPacket);
          transform(buf.slice(4));
          return;
        }
        if (size === 2) {
          this.push(SpecialPacketLine.MessagePacket);
          transform(buf.slice(4));
          return;
        } else {
          remainingOnLine = Math.max(0, size - 4);
          transform(buf.slice(4));
          return;
        }
      }
    };
    super({
      writableObjectMode: false,
      readableObjectMode: true,
      transform(chunk: Buffer, _encoding, cb) {
        transform(chunk);
        cb();
      },
    });
  }
}

export class PacketLineGenerator extends Transform {
  constructor() {
    super({
      writableObjectMode: true,
      readableObjectMode: false,
      transform(line, _encoding, cb) {
        this.push(printPktLine(line));
        cb();
      },
    });
  }
}
