export default function applyDelta(delta: Buffer, base: Buffer) {
  let [expectedBaseLength, index] = readLength(delta, 0);
  if (base.length !== expectedBaseLength) {
    throw new Error('Base length mismatch');
  }

  let outputLength;
  [outputLength, index] = readLength(delta, index);
  // Create a new output buffer with length from header.
  const output = Buffer.alloc(outputLength);

  let pointer = 0;
  while (index < delta.length) {
    const byte = delta[index++];
    // Copy command.  Tells us offset in base and length to copy.
    if (byte & 0x80) {
      let offset = 0;
      let length = 0;
      if (byte & 0x01) offset |= delta[index++] << 0;
      if (byte & 0x02) offset |= delta[index++] << 8;
      if (byte & 0x04) offset |= delta[index++] << 16;
      if (byte & 0x08) offset |= delta[index++] << 24;
      if (byte & 0x10) length |= delta[index++] << 0;
      if (byte & 0x20) length |= delta[index++] << 8;
      if (byte & 0x40) length |= delta[index++] << 16;
      if (length === 0) length = 0x10000;
      // copy the data
      output.set(base.slice(offset, offset + length), pointer);
      pointer += length;
    }
    // Insert command, opcode byte is length itself
    else if (byte) {
      output.set(delta.slice(index, index + byte), pointer);
      index += byte;
      pointer += byte;
    } else throw new Error('Invalid delta opcode');
  }

  if (pointer !== output.length) {
    throw new Error('Size mismatch in check');
  }

  return output;
}

function readLength(buffer: Buffer, index: number) {
  let byte = buffer[index++];
  let length = byte & 0x7f;
  let shift = 7;
  while (byte & 0x80) {
    byte = buffer[index++];
    length |= (byte & 0x7f) << shift;
    shift += 7;
  }
  return [length, index];
}
