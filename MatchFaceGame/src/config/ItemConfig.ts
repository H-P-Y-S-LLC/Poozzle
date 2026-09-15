/**
 * Item catalog (catalog/items.json).
 * Spec: Documents/ThreeJsWebPortDevDoc.md §2.2.1, §5.9, §5.10.
 */
import { ciArrObj, ciBool, ciNum, ciStr, ciStrArr, type JsonObject } from "./CaseInsensitiveJson.js";

export interface ItemDef {
  id: string;
  name: string;
  nameZh: string;
  stackMax: number;
  usableInModes: string[];
  perLevelUseLimit: number;
  bRequiresExecutor: boolean;
}

export interface ItemCatalog {
  items: ItemDef[];
}

export function parseItemCatalog(json: JsonObject): ItemCatalog {
  const items = ciArrObj(json, "items").map((o): ItemDef => ({
    id: ciStr(o, "id", ""),
    name: ciStr(o, "name", ""),
    nameZh: ciStr(o, "nameZh", ""),
    stackMax: ciNum(o, "stackMax", 99),
    usableInModes: ciStrArr(o, "usableInModes"),
    perLevelUseLimit: ciNum(o, "perLevelUseLimit", 0),
    bRequiresExecutor: ciBool(o, "bRequiresExecutor", false),
  }));
  return { items: items.filter((i) => i.id.length > 0) };
}
