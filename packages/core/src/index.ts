export {
  decode,
  encode,
  concat,
  fromDec,
  fromHex,
  fromOct,
  fromDecChar,
  fromHexChar,
  toHexChar,
  NEWLINE,
} from './utils';

export enum Mask {
  mask = 0o100000,
  blob = 0o140000,
  file = 0o160000,
}

export enum Mode {
  tree = 0o040000,
  blob = 0o100644,
  file = 0o100644,
  exec = 0o100755,
  sym = 0o120000,
  commit = 0o160000,
}

export enum Type {
  unknown = 'unknown',
  commit = 'commit',
  tree = 'tree',
  blob = 'blob',
  tag = 'tag',
}

export function isBlob(mode: number) {
  return (mode & Mask.blob) === Mask.mask;
}

export function isFile(mode: number) {
  return (mode & Mask.file) === Mask.mask;
}

export function toType(mode: number) {
  if (mode === Mode.commit) return Type.commit;
  if (mode === Mode.tree) return Type.tree;
  if ((mode & Mask.blob) === Mask.mask) return Type.blob;
  return Type.unknown;
}

export type Hash = string;
