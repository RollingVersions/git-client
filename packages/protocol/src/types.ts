// https://git-scm.com/docs/pack-protocol
// https://git-scm.com/docs/protocol-common
// https://git-scm.com/docs/protocol-v2

import ObjectFilter from './ObjectFilter';

export type Capabilities = {[k: string]: string | boolean};

// an object ID is the sha1 hash of an object in git
export type ObjectID = string;

export interface UploadRequest {
  /**
   * Clients MUST send at least one want command in the request body.
   *
   * Clients MUST NOT mention an obj-id in a want command which did not
   * appear in the response obtained through ref discovery (unless the
   * server advertises capability allow-tip-sha1-in-want or
   * allow-reachable-sha1-in-want)
   */
  want: readonly ObjectID[];
  /**
   * The client MUST write all obj-ids which it only has shallow copies of
   * (meaning that it does not have the parents of a commit) so that the
   * server is aware of the limitations of the client’s history.
   */
  shallow?: readonly ObjectID[];
  deepen?: readonly number[];
  deepenSince?: readonly Date[];
  deepenNot?: readonly ObjectID[];
  filterRequest?: readonly ObjectFilter[];
}

/**
 * If the client sent a positive depth request, the server will determine which
 * commits will and will not be shallow and send this information to the client.
 * If the client did not request a positive depth, this step is skipped.
 */
export interface ShallowUpdateResponse {
  /**
   * The server writes shallow lines for each commit whose parents will not be sent as a result
   */
  shallow?: readonly ObjectID[];
  /**
   *  The server writes an unshallow line for each commit which the client has indicated is shallow,
   * but is no longer shallow at the currently requested depth (that is, its parents will now be sent).
   */
  unshallow?: readonly ObjectID[];
}

/**
 * Now the client will send a list of the obj-ids it has using have lines, so the server can make a
 * packfile that only contains the objects that the client needs. In multi_ack mode, the canonical
 * implementation will send up to 32 of these at a time, then will send a flush-pkt. The canonical
 * implementation will skip ahead and send the next 32 immediately, so that there is always a block
 * of 32 "in-flight on the wire" at a time.
 */
export interface UploadHavesRequest {
  have: readonly ObjectID[];
}
