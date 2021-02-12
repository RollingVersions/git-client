import {Capabilities} from '@rollingversions/git-protocol';
import HttpInterface from './HttpInterface';

export default interface Context<
  THeaders extends {set(name: string, value: string): unknown}
> {
  readonly http: HttpInterface<THeaders>;
  readonly agent: string;
}
export interface ContextWithServerCapabilities<
  THeaders extends {set(name: string, value: string): unknown}
> extends Context<THeaders> {
  readonly serverCapabilities: Capabilities;
}
