import {Capabilities} from '@rollingversions/git-protocol';
import FetchInterface from './FetchInterface';

export default interface HttpContext {
  readonly fetch: FetchInterface;
  readonly agent: string;
}
export interface HttpContextWithServerCapabilities extends HttpContext {
  readonly serverCapabilities: Capabilities;
}
