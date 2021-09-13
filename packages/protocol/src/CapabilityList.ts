import {PacketLine} from './PktLines';

// key = 1*(ALPHA | DIGIT | "-_")
// value = 1*(ALPHA | DIGIT | " -_.,?\/{}[]()<>!@#$%^&*+=:;")
type Capabilities = Pick<
  Map<string, string | boolean>,
  'has' | 'get' | 'entries'
>;
export default Capabilities;

export function composeCapabilityList(
  capabilities: Capabilities,
): PacketLine[] {
  const result: PacketLine[] = [];
  for (const [key, value] of capabilities.entries()) {
    if (!/^[a-z0-9\-\_]+$/i.test(key)) {
      throw new Error(`Invalid capability key: "${key}"`);
    }
    if (value === false) {
      continue;
    }
    if (value === true) {
      result.push(`${key}\n`);
    } else {
      if (
        !/^[a-z0-9\ \-\_\.\,\?\\\/\{\}\[\]\(\)\<\>\!\@\#\$\%\^\&\*\+\=\:\;]+$/i.test(
          key,
        )
      ) {
        throw new Error(`Invalid capability value for "${key}": "${value}"`);
      }
      result.push(`${key}=${value}\n`);
    }
  }
  return result;
}
