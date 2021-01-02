import {
  packetLineParser,
  packetLinePrinter,
  SpecialPacketLine,
} from './PktLines';
import ObjectFilter from './ObjectFilter';
import Capabilities, {composeCapabilityList} from './CapabilityList';

// Sample Request:
// 0016object-format=sha1
// 0011command=fetch
// 0014agent=git/2.30.00001
// 000dthin-pack
// 000dofs-delta
// 0032want f6721b42402308c856c6d7f12a76de4612819a29
// 0032want f6721b42402308c856c6d7f12a76de4612819a29
// 0032want cb73a4316c9d09477a54c564bffafec4fc54f7e0
// 0032want 03ca392fee460157e6fef84f0dcd6679f66af891

export default interface FetchCommand {
  /**
   * Indicates to the server an object which the client wants to
   * retrieve.  Wants can be anything and are not limited to
   * advertised objects.
   */
  want: readonly string[];
  /**
   * Indicates to the server an object which the client has locally.
   * This allows the server to make a packfile which only contains
   * the objects that the client needs. Multiple 'have' lines can be
   * supplied.
   */
  have?: readonly string[];

  /**
   * Request that a thin pack be sent, which is a pack with deltas
   * which reference base objects not contained within the pack (but
   * are known to exist at the receiving end). This can reduce the
   * network traffic significantly, but it requires the receiving end
   * to know how to "thicken" these packs by adding the missing bases
   * to the pack.
   *
   * @default false
   */
  thinPack?: boolean;

  /**
   * Request that progress information that would normally be sent on
   * side-band channel 2, during the packfile transfer, should not be
   * sent.  However, the side-band channel 3 is still used for error
   * responses.
   *
   * @default false
   */
  noProgress?: boolean;

  /**
   * Request that annotated tags should be sent if the objects they
   * point to are being sent.
   *
   * @default false
   */
  includeTag?: boolean;

  // "shallow", "deepen", "deepen-relative", "deepen-since", "deepen-not" all require the server to have advertised the "shallow" feature in the "fetch" capability
  // e.g. `fetch=shallow filter`

  /**
   * A client must notify the server of all commits for which it only
   * has shallow copies (meaning that it doesn't have the parents of
   * a commit) by supplying a 'shallow <oid>' line for each such
   * object so that the server is aware of the limitations of the
   * client's history.  This is so that the server is aware that the
   * client may not have all objects reachable from such commits.
   */
  shallow?: readonly string[];
  deepen?: readonly number[];
  deepenSince?: readonly Date[];
  deepenNot?: readonly string[];

  filterRequest?: readonly ObjectFilter[];
}

export const composeFetchCommand = packetLinePrinter(
  async function* composeLsRefsCommand(
    command: FetchCommand,
    capabilities: Capabilities,
  ) {
    yield `command=fetch\n`;
    yield* composeCapabilityList(capabilities);
    yield SpecialPacketLine.DelimiterPacket;
    if (command.thinPack) {
      yield `thin-pack\n`;
    }
    if (command.noProgress) {
      yield `no-progress\n`;
    }
    if (command.includeTag) {
      yield `include-tag\n`;
    }
    for (const want of command.want) {
      yield `want ${want}\n`;
    }
    for (const have of command.have ?? []) {
      yield `have ${have}\n`;
    }
    for (const shallow of command.shallow ?? []) {
      yield `shallow ${shallow}\n`;
    }
    yield `done`;
    yield SpecialPacketLine.FlushPacket;
  },
);

export const parseFetchResponse = packetLineParser(
  async function* parseLsRefsResponse(_response) {
    throw new Error('Not implemented');
  },
);
