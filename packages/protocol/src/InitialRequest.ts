import Capabilities from './CapabilityList';
import {isSpecialPacket, packetLineParser, SpecialPacketLine} from './PktLines';

export const parseInitialResponse = packetLineParser(
  async (packets): Promise<Capabilities> => {
    const capabilities = new Map<string, string | boolean>();
    let isStart = true;
    let gotVersion = false;
    let gotVersionAtLeastOnce = false;
    for await (const packet of packets) {
      if (packet === SpecialPacketLine.FlushPacket) {
        isStart = true;
        gotVersion = false;
      }
      if (isSpecialPacket(packet)) {
        continue;
      }
      const line = await packet.toString();
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
    }
    if (!gotVersionAtLeastOnce) {
      throw new Error(
        `The server did not respond with "version 2" as the protocol`,
      );
    }
    return capabilities;
  },
);
