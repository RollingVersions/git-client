import {Transform} from 'stream';
import Capabilities, {composeCapabilityList} from './CapabilityList';
import {
  isSpecialPacket,
  PacketLineGenerator,
  PacketLineParser,
  SpecialPacketLine,
} from './PktLines';

// Sample request:

// 0014command=ls-refs
// 0014agent=git/2.30.00016object-format=sha100010009peel
// 000csymrefs
// 0014ref-prefix HEAD
// 001bref-prefix refs/heads/
// 001aref-prefix refs/tags/
// 0000

// Sample response:

// 0052f6721b42402308c856c6d7f12a76de4612819a29 HEAD symref-target:refs/heads/master
// 003ff6721b42402308c856c6d7f12a76de4612819a29 refs/heads/master
// 0075cb73a4316c9d09477a54c564bffafec4fc54f7e0 refs/tags/@rollingversions/test-single-npm-package-github-actions@1.0.0
// 007503ca392fee460157e6fef84f0dcd6679f66af891 refs/tags/@rollingversions/test-single-npm-package-github-actions@1.1.0
// 0000

export default interface LsRefsCommand {
  /**
   * In addition to the object pointed by it, show the underlying ref
   * pointed by it when showing a symbolic ref.
   *
   * @default false
   */
  symrefs?: boolean;
  /**
   * Show peeled tags.
   *
   * @default false
   */
  peel?: boolean;
  /**
   * When specified, only references having a prefix matching one of
   * the provided prefixes are displayed.
   */
  refPrefix?: readonly string[];
}
export interface LsRefsResponseEntry {
  objectID: string;
  refName: string;
  symrefTarget: string | null;
  peeled: string[];
}

export function composeLsRefsCommand(
  command: LsRefsCommand,
  capabilities: Capabilities,
): NodeJS.ReadableStream {
  const output = new PacketLineGenerator();
  output.write(`command=ls-refs\n`);
  for (const line of composeCapabilityList(capabilities)) {
    output.write(line);
  }
  output.write(SpecialPacketLine.DelimiterPacket);
  if (command.symrefs) {
    output.write(`symrefs\n`);
  }
  if (command.peel) {
    output.write(`peel\n`);
  }
  for (const prefix of command.refPrefix ?? []) {
    output.write(`ref-prefix ${prefix}\n`);
  }
  output.write(SpecialPacketLine.FlushPacket);
  output.end();
  return output;
}

export class LsRefsResponseParser extends Transform {
  constructor() {
    super({
      writableObjectMode: true,
      readableObjectMode: true,
      transform(pkt: SpecialPacketLine | Buffer, _encoding, cb) {
        if (pkt === SpecialPacketLine.FlushPacket) {
          return cb();
        }
        if (isSpecialPacket(pkt)) {
          return cb(new Error(`Unexpected packet: "${pkt}"`));
        }
        const lineStr = pkt.toString(`utf8`).replace(/\n$/, ``);
        const line = lineStr.split(' ');
        if (line.length < 2) {
          return cb(new Error(`Invalid line: "${line.join(` `)}"`));
        }
        const [objectID, refName, ...refAttributes] = line;
        const symrefTarget =
          refAttributes
            .filter((a) => a.startsWith('symref-target:'))
            .map((a) => a.substr('symref-target:'.length))
            .find(() => true) ?? null;
        const peeled = refAttributes
          .filter((a) => a.startsWith('peeled:'))
          .map((a) => a.substr('peeled:'.length));
        const entry: LsRefsResponseEntry = {
          objectID,
          refName,
          symrefTarget,
          peeled,
        };
        this.push(entry);
        cb();
      },
    });
  }
}

export async function parseLsRefsResponse(
  response: NodeJS.ReadableStream,
): Promise<LsRefsResponseEntry[]> {
  return await new Promise<LsRefsResponseEntry[]>((resolve, reject) => {
    const result: LsRefsResponseEntry[] = [];
    response
      .on(`error`, reject)
      .pipe(new PacketLineParser())
      .on(`error`, reject)
      .pipe(new LsRefsResponseParser())
      .on(`error`, reject)
      .on(`data`, (entry: LsRefsResponseEntry) => result.push(entry))
      .on(`end`, () => resolve(result));
  });
}
