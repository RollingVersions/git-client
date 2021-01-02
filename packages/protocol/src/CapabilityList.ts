import {PacketLine} from './PktLines';

// key = 1*(ALPHA | DIGIT | "-_")
// value = 1*(ALPHA | DIGIT | " -_.,?\/{}[]()<>!@#$%^&*+=:;")
type Capabilities = Pick<
  Map<string, string | boolean>,
  'has' | 'get' | 'entries'
>;
export default Capabilities;

export function* composeCapabilityList(
  capabilities: Capabilities,
): Generator<PacketLine> {
  for (const [key, value] of capabilities.entries()) {
    if (value === true) {
      yield `${key}\n`;
    } else {
      yield `${key}=${value}\n`;
    }
  }
}
