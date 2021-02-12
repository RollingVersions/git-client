export enum FilterType {
  BlobNone,
  BlobLimit,
  Sparse,
  TreeDepth,
}

/**
 * Omit all blobs
 */
export interface BlobNoneFilter {
  readonly type: FilterType.BlobNone;
}

/**
 * Omit all blobs
 */
export function blobNone(): BlobNoneFilter {
  return {type: FilterType.BlobNone};
}

/**
 * Omits blobs larger than n bytes. n may be zero.
 */
export interface BlobLimitFilter {
  readonly type: FilterType.BlobLimit;
  readonly bytes: number;
}

/**
 * Omits blobs larger than n bytes. n may be zero.
 */
export function blobLimit(bytes: number): BlobLimitFilter {
  return {type: FilterType.BlobLimit, bytes};
}

/**
 * Use a sparse-checkout specification contained in the blob (or blob-expression) <blob-ish>
 * to omit blobs that would not be not required for a sparse checkout on the requested refs.
 */
export interface SparseFilter {
  readonly type: FilterType.Sparse;
  readonly oid: string;
}

/**
 * Use a sparse-checkout specification contained in the blob (or blob-expression) <blob-ish>
 * to omit blobs that would not be not required for a sparse checkout on the requested refs.
 */
export function sparse(oid: string): SparseFilter {
  return {type: FilterType.Sparse, oid};
}

/**
 * Omit all blobs and trees whose depth from the root tree is >= <depth> (minimum depth if an
 * object is located at multiple depths in the commits traversed). <depth> = 0 will not include
 * any trees or blobs unless included explicitly. <depth> = 1 will include only the tree and blobs
 * which are referenced directly by a commit reachable from <commit> or an explicitly-given object.
 * <depth> = 2 is like <depth> = 1 while also including trees and blobs one more level removed
 * from an explicitly-given commit or tree.
 */
export interface TreeDepthFilter {
  readonly type: FilterType.TreeDepth;
  readonly maxDepth: number;
}

/**
 * Omit all blobs and trees whose depth from the root tree is >= <depth> (minimum depth if an
 * object is located at multiple depths in the commits traversed). <depth> = 0 will not include
 * any trees or blobs unless included explicitly. <depth> = 1 will include only the tree and blobs
 * which are referenced directly by a commit reachable from <commit> or an explicitly-given object.
 * <depth> = 2 is like <depth> = 1 while also including trees and blobs one more level removed
 * from an explicitly-given commit or tree.
 */
export function treeDepth(maxDepth: number): TreeDepthFilter {
  return {type: FilterType.TreeDepth, maxDepth};
}

type ObjectFilter =
  | BlobNoneFilter
  | BlobLimitFilter
  | SparseFilter
  | TreeDepthFilter;

export default ObjectFilter;

export function objectFiltersToString(
  filter: ObjectFilter,
  ...filters: ObjectFilter[]
): string;
export function objectFiltersToString(
  ...filters: ObjectFilter[]
): string | null;
export function objectFiltersToString(
  ...filters: ObjectFilter[]
): string | null {
  if (filters.length === 0) return null;
  if (filters.length > 1) {
    return `combine:${filters
      .map((f) => encodeURIComponent(objectFiltersToString(f)))
      .join('+')}`;
  }
  const [filter] = filters;
  switch (filter.type) {
    case FilterType.BlobNone:
      return `blob:none`;
    case FilterType.BlobLimit:
      if (
        isNaN(filter.bytes) ||
        filter.bytes < 0 ||
        filter.bytes !== Math.floor(filter.bytes) ||
        filter.bytes > Math.pow(2, 32)
      ) {
        throw new Error(
          `Invalid limit for blob size filter. Expected a positive int 32.`,
        );
      }
      return `blob:limit=${filter.bytes.toString(10)}`;
    case FilterType.Sparse:
      return `sparse:oid=${filter.oid}`;
    case FilterType.TreeDepth:
      if (
        isNaN(filter.maxDepth) ||
        filter.maxDepth < 0 ||
        filter.maxDepth !== Math.floor(filter.maxDepth) ||
        filter.maxDepth > Math.pow(2, 32)
      ) {
        throw new Error(
          `Invalid limit for tree depth filter. Expected a positive int 32.`,
        );
      }
      return `tree:${filter.maxDepth}`;
  }
}
