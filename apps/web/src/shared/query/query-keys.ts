/**
 * Every query showing filesystem content lives under this root, so a finished job (copy, move,
 * delete…) can refresh them all without knowing which views are open.
 */
export const filesystemQueryRoot = 'fs';
