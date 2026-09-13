/**
 * FNV-1a 32-bit hashing + deterministic hash streams.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.2.3
 */

/** FNV-1a 32-bit. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stable pseudo-random sequence derived from a hash (mulberry32 step). */
export function hashStream(hash: number): () => number {
  let s = hash >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Convert an Unreal asset path to a logical registry key.
 * Spec §2.1.2:
 *   "/Game/Models/paper/Paper.Paper" -> "Models/paper/Paper"
 */
export function toLogicalPath(unrealPath: string): string {
  let p = unrealPath.trim();
  const game = p.indexOf("/Game/");
  if (game >= 0) p = p.slice(game + "/Game/".length);
  else if (p.startsWith("/Game")) p = p.slice("/Game".length).replace(/^\/+/, "");
  // strip the UE "<Name>.<Name>" suffix (last dot)
  const dot = p.lastIndexOf(".");
  if (dot >= 0) p = p.slice(0, dot);
  return p.replace(/\/+$/, "");
}

/** basename of a logical path. */
export function basename(logicalPath: string): string {
  const slash = logicalPath.lastIndexOf("/");
  return slash >= 0 ? logicalPath.slice(slash + 1) : logicalPath;
}

/** dirname of a logical path ("" if none). */
export function dirname(logicalPath: string): string {
  const slash = logicalPath.lastIndexOf("/");
  return slash >= 0 ? logicalPath.slice(0, slash) : "";
}
