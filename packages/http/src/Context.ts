import {Capabilities} from '@rollingversions/git-protocol';
import HttpInterface from './HttpInterface';

export default interface Context {
  readonly http: HttpInterface;
  readonly agent: string;
}
export interface ContextWithServerCapabilities extends Context {
  readonly serverCapabilities: Capabilities;
}
