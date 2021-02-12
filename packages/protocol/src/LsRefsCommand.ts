import Capabilities, {composeCapabilityList} from './CapabilityList';
import {
  isSpecialPacket,
  packetLineParser,
  packetLinePrinter,
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

export const composeLsRefsCommand = packetLinePrinter(
  async function* composeLsRefsCommand(
    command: LsRefsCommand,
    capabilities: Capabilities,
  ) {
    yield `command=ls-refs\n`;
    yield* composeCapabilityList(capabilities);
    yield SpecialPacketLine.DelimiterPacket;
    if (command.symrefs) {
      yield `symrefs\n`;
    }
    if (command.peel) {
      yield `peel\n`;
    }
    for (const prefix of command.refPrefix ?? []) {
      yield `ref-prefix ${prefix}\n`;
    }
    yield SpecialPacketLine.FlushPacket;
  },
);

export const parseLsRefsResponse = packetLineParser(
  async function* parseLsRefsResponse(
    response,
  ): AsyncIterableIterator<LsRefsResponseEntry> {
    for await (const pkt of response) {
      if (pkt === SpecialPacketLine.FlushPacket) {
        break;
      }
      if (isSpecialPacket(pkt)) {
        throw new Error(`Unexpected packet: "${pkt}"`);
      }
      const lineStr = await pkt.toString();
      const line = lineStr.split(' ');
      if (line.length < 2) {
        throw new Error(`Invalid line: "${line.join(` `)}"`);
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
      yield {
        objectID,
        refName,
        symrefTarget,
        peeled,
      };
    }
  },
);
