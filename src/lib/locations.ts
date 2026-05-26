/**
 * Shopify store locations for buyback inventory.
 *
 * Hard-coded for now — Shopify's location list is stable, and a 9-row UI
 * dropdown doesn't justify a DB table. To add/remove: edit this array and
 * redeploy. (If you later want admin-editable, move to Settings model.)
 */
export interface StoreLocation {
  id: string;
  name: string;
}

export const STORE_LOCATIONS: StoreLocation[] = [
  { id: "84792082589", name: "MR 青衣城 148 號鋪" },
  { id: "85475426461", name: "中美 5 樓" },
  { id: "85475360925", name: "中美 Office" },
  { id: "83019923613", name: "中美中心 B 座 3 樓 304 店" },
  { id: "85471002781", name: "天悅廣場 140 店" },
  { id: "85470871709", name: "希慎廣場 514 店" },
  { id: "85470806173", name: "旺角信和中心 (246 店)" },
  { id: "85470773405", name: "旺角信和中心 (M45 店)" },
  { id: "85471133853", name: "灣仔 188 商場 257 店" },
];

export function findLocation(id?: string | null): StoreLocation | undefined {
  if (!id) return undefined;
  return STORE_LOCATIONS.find((l) => l.id === id);
}
