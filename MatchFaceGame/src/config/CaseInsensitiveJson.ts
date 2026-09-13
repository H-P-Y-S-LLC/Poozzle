/**
 * Case-insensitive JSON field access.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §2.2.3.
 *
 * UE's FJsonObjectConverter compares FNames case-insensitively, so `maxHp`
 * and `maxHP` must both work in the web build.
 */

export type JsonObject = Record<string, unknown>;

export function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Case-insensitive property lookup.
 * Exact match first, then a lowercase scan.
 */
export function ciGet(obj: JsonObject | undefined | null, key: string): unknown {
  if (!obj) return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  const lower = key.toLowerCase();
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === lower) return obj[k];
  }
  return undefined;
}

export function ciHas(obj: JsonObject | undefined | null, key: string): boolean {
  return ciGet(obj, key) !== undefined;
}

export function ciNum(obj: JsonObject | undefined | null, key: string, def: number): number {
  const v = ciGet(obj, key);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return def;
}

/** Number with "was it explicitly present" flag (for override semantics §2.4.1). */
export function ciNumOpt(obj: JsonObject | undefined | null, key: string): { present: boolean; value: number } {
  const v = ciGet(obj, key);
  if (typeof v === "number" && Number.isFinite(v)) return { present: true, value: v };
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return { present: true, value: Number(v) };
  return { present: false, value: 0 };
}

export function ciBool(obj: JsonObject | undefined | null, key: string, def: boolean): boolean {
  const v = ciGet(obj, key);
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
  }
  return def;
}

/** HP fields need both `maxHp` and `maxHP` forms (§2.2.3 special case). */
export function ciNumHp(obj: JsonObject | undefined | null, camel: string, upper: string, def: number): number {
  const a = ciGet(obj, camel);
  if (typeof a === "number") return a;
  const b = ciGet(obj, upper);
  if (typeof b === "number") return b;
  return def;
}

export function ciStr(obj: JsonObject | undefined | null, key: string, def: string): string {
  const v = ciGet(obj, key);
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return def;
}

export function ciObj(obj: JsonObject | undefined | null, key: string): JsonObject {
  const v = ciGet(obj, key);
  return isObject(v) ? v : {};
}

export function ciArr(obj: JsonObject | undefined | null, key: string): unknown[] {
  const v = ciGet(obj, key);
  return Array.isArray(v) ? v : [];
}

export function ciArrObj(obj: JsonObject | undefined | null, key: string): JsonObject[] {
  return ciArr(obj, key).filter(isObject);
}

export function ciNumArr(obj: JsonObject | undefined | null, key: string): number[] {
  return ciArr(obj, key)
    .map((v) => (typeof v === "number" ? v : Number(v)))
    .filter((n) => Number.isFinite(n));
}

export function ciStrArr(obj: JsonObject | undefined | null, key: string): string[] {
  return ciArr(obj, key).map((v) => (typeof v === "string" ? v : String(v)));
}
