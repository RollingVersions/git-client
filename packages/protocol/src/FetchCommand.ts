import {decode, Type} from '@rollingversions/git-core';
import {PackfileParserStream, Stores} from '@rollingversions/git-packfile';
import {
  isSpecialPacket,
  PacketLineGenerator,
  PacketLineParser,
  SpecialPacketLine,
} from './PktLines';
import ObjectFilter, {objectFiltersToString} from './ObjectFilter';
import Capabilities, {composeCapabilityList} from './CapabilityList';
import {PassThrough, Transform} from 'stream';

export interface FetchCommandOutputOptions extends Stores {
  /**
   * Return the raw packfile, rather than parsed objects
   */
  raw?: boolean;
}
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

// Some options require the server to have advertised the matching feature, e.g.
// "filter" requires the server to have advertised the "filter" feature in the
// "fetch" capability. This would look something like: `fetch=shallow filter`
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

  /**
   * A client must notify the server of all commits for which it only
   * has shallow copies (meaning that it doesn't have the parents of
   * a commit) by supplying a 'shallow <oid>' line for each such
   * object so that the server is aware of the limitations of the
   * client's history.  This is so that the server is aware that the
   * client may not have all objects reachable from such commits.
   *
   * Requires the "shallow" feature on the server
   */
  shallow?: readonly string[];
  /**
   * Requests that the fetch/clone should be shallow having a commit
   * depth of <depth> relative to the remote side.
   *
   * Requires the "shallow" feature on the server
   */
  deepen?: number;
  /**
   * Requests that the semantics of the "deepen" command be changed
   * to indicate that the depth requested is relative to the client's
   * current shallow boundary, instead of relative to the requested
   * commits.
   *
   * Requires the "shallow" feature on the server
   *
   * @default false
   */
  deepenRelative?: boolean;
  /**
   * Requests that the shallow clone/fetch should be cut at a
   * specific time, instead of depth.  Internally it's equivalent to
   * doing "git rev-list --max-age=<timestamp>". Cannot be used with
   * "deepen".
   *
   * Requires the "shallow" feature on the server
   */
  deepenSince?: Date;
  /**
   * Requests that the shallow clone/fetch should be cut at a
   * specific revision specified by '<rev>', instead of a depth.
   * Internally it's equivalent of doing "git rev-list --not <rev>".
   * Cannot be used with "deepen", but can be used with
   * "deepen-since".
   *
   * Requires the "shallow" feature on the server
   */
  deepenNot?: readonly string[];

  /**
   * Request that various objects from the packfile be omitted
   * using one of several filtering techniques. These are intended
   * for use with partial clone and partial fetch operations.
   *
   * Requires the "filter" feature on the server
   */
  filter?: readonly ObjectFilter[];

  /**
   * Indicates to the server that the client wants to retrieve a
   * particular ref, where <ref> is the full name of a ref on the
   * server.
   *
   * Requires the "ref-in-want" feature on the server
   */
  wantRefs?: readonly string[];

  /**
   * Instruct the server to send the whole response multiplexed, not just
   * the packfile section. All non-flush and non-delim PKT-LINE in the
   * response (not only in the packfile section) will then start with a byte
   * indicating its sideband (1, 2, or 3), and the server may send "0005\2"
   * (a PKT-LINE of sideband 2 with no payload) as a keepalive packet.
   *
   * Requires the "sideband-all" feature on the server
   *
   * @default false
   */
  sidebandAll?: boolean;

  /**
   * Indicates to the server that the client is willing to receive
   * URIs of any of the given protocols in place of objects in the
   * sent packfile. Before performing the connectivity check, the
   * client should download from all given URIs. Currently, the
   * protocols supported are "http" and "https".
   *
   * Requires the "packfile-uris" feature on the server
   */
  packfileUriProtocols?: readonly string[];
}

export function composeFetchCommand(
  command: FetchCommand,
  capabilities: Capabilities,
): NodeJS.ReadableStream {
  const packetLines = new PacketLineGenerator();
  packetLines.write(`command=fetch\n`);
  for (const capability of composeCapabilityList(capabilities)) {
    packetLines.write(capability);
  }
  packetLines.write(SpecialPacketLine.DelimiterPacket);
  if (command.thinPack) {
    packetLines.write(`thin-pack\n`);
  }
  if (command.noProgress) {
    packetLines.write(`no-progress\n`);
  }
  if (command.includeTag) {
    packetLines.write(`include-tag\n`);
  }
  for (const want of command.want) {
    packetLines.write(`want ${want}\n`);
  }
  for (const have of command.have ?? []) {
    packetLines.write(`have ${have}\n`);
  }
  for (const shallow of command.shallow ?? []) {
    packetLines.write(`shallow ${shallow}\n`);
  }
  if (command.deepen !== undefined) {
    packetLines.write(`deepen ${command.deepen}\n`);
  }
  if (command.deepenRelative) {
    packetLines.write(`deepen-relative\n`);
  }
  if (command.deepenSince !== undefined) {
    packetLines.write(`deepen-since ${command.deepenSince}\n`);
  }
  for (const deepenNot of command.deepenNot ?? []) {
    packetLines.write(`deepen-not ${deepenNot}\n`);
  }
  if (command.filter?.length) {
    packetLines.write(`filter ${objectFiltersToString(...command.filter)}`);
  }
  for (const wantRefs of command.wantRefs ?? []) {
    packetLines.write(`want-ref ${wantRefs}\n`);
  }
  if (command.sidebandAll) {
    packetLines.write(`sideband-all\n`);
  }
  if (command.packfileUriProtocols?.length) {
    packetLines.write(
      `packfile-uris ${command.packfileUriProtocols.join(',')}\n`,
    );
  }
  packetLines.write(`done`);
  packetLines.write(SpecialPacketLine.FlushPacket);
  packetLines.end();
  return packetLines;
}

export interface FetchResponseEntryObject {
  type: Type;
  hash: string;
  body: Uint8Array;
}

export class FetchResponseMetadataParser extends Transform {
  constructor() {
    super({
      writableObjectMode: true,
      readableObjectMode: false,
      transform(pkt: SpecialPacketLine | Buffer, _encoding, cb) {
        if (isSpecialPacket(pkt)) {
          this.emit(`special`, pkt);
          return cb();
        }

        const channel = pkt[0];
        switch (channel) {
          case 1:
            this.push(pkt.slice(1));
            break;
          case 2: {
            this.emit(`progress`, decode(pkt.slice(1)).trim());
            break;
          }
          case 3: {
            this.emit(`error`, new Error(decode(pkt.slice(1)).trim()));
            break;
          }
          default:
            break;
        }
        cb();
      },
    });
  }
}

// use split iterator to produce 4 "channels":
// 1. headers
// 2. packfile chunks
// 3. progress
// 4. errors
// parse the packfile chunks, then merge everything back together
// using mergeAsyncIterator
export function parseFetchResponse(
  response: NodeJS.ReadableStream,
  {raw = false, ...stores}: FetchCommandOutputOptions = {},
) {
  const output = new PassThrough({objectMode: true});
  const rawResponse = response
    .on('error', (err) => output.emit(`error`, err))
    .pipe(new PacketLineParser())
    .on('error', (err) => output.emit(`error`, err))
    .pipe(new FetchResponseMetadataParser())
    .on('error', (err) => output.emit(`error`, err))
    .on('progress', (progress) => output.emit(`progress`, progress));
  if (raw) {
    rawResponse.pipe(output);
  } else {
    rawResponse
      .pipe(new PackfileParserStream(stores))
      .on('error', (err) => output.emit(`error`, err))
      .pipe(output);
  }
  return output;
}
