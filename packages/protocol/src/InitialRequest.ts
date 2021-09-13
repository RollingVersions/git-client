import Capabilities from './CapabilityList';
import {isSpecialPacket, PacketLineParser, SpecialPacketLine} from './PktLines';

export async function parseInitialResponse(
  response: NodeJS.ReadableStream,
): Promise<Capabilities> {
  const capabilities = new Map<string, string | boolean>();
  let isStart = true;
  let gotVersion = false;
  let gotVersionAtLeastOnce = false;
  await new Promise<void>((resolve, reject) => {
    response
      .on(`error`, reject)
      .pipe(new PacketLineParser())
      .on(`error`, reject)
      .on(`data`, (packet: Buffer | SpecialPacketLine) => {
        if (packet === SpecialPacketLine.FlushPacket) {
          isStart = true;
          gotVersion = false;
        }
        if (isSpecialPacket(packet)) {
          return;
        }
        const line = packet.toString(`utf8`).replace(/\n$/, ``);
        if (gotVersion) {
          const [key, ...value] = line.split('=');
          if (value.length) {
            capabilities.set(key, value.join('='));
          } else {
            capabilities.set(key, true);
          }
        } else if (isStart) {
          if (line === 'version 2') {
            gotVersion = true;
            gotVersionAtLeastOnce = true;
          } else {
            isStart = false;
          }
        }
      })
      .on(`end`, () => resolve());
  });
  if (!gotVersionAtLeastOnce) {
    throw new Error(
      `The server did not respond with "version 2" as the protocol`,
    );
  }
  return capabilities;
}
