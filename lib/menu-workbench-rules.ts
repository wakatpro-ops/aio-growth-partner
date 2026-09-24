export type MenuAccess = { accountActive: boolean; isPlatformAdmin: boolean; organizationRoles: Record<string, string>; storeRoles: Record<string, string> };
export function menuPermissions(access: MenuAccess | null, organizationId: string, storeId: string) {
  const roles = access ? [access.organizationRoles[organizationId], access.storeRoles[storeId]] : [];
  const manager = Boolean(access?.accountActive && (access.isPlatformAdmin || roles.some(role => role === "org_owner" || role === "store_manager")));
  return { manager, operate: manager || Boolean(access?.accountActive && roles.includes("staff")) };
}
export const availabilityLabels = { available: "販売中", sold_out: "売り切れ", paused: "お休み" } as const;
export type Availability = keyof typeof availabilityLabels;
export function menuTabs(industry: string) {
  if (industry === "restaurant") return ["メニュー", "食材・仕入", "売れ方・利益"];
  if (industry === "beauty_salon") return ["施術・店販", "店販・在庫", "売れ方・利益"];
  if (industry === "retail") return ["商品", "在庫・発注", "売れ方・利益"];
  if (industry === "auto_repair") return ["サービス・部品", "部品・仕入", "売れ方・利益"];
  return ["商品・サービス", "資材・仕入", "売れ方・利益"];
}
export function itemAvailability(item: { status: string; availability?: string }) : Availability {
  if (item.status !== "active") return "paused";
  return item.availability === "sold_out" ? "sold_out" : "available";
}
export function itemPhoto(metadata: Record<string, unknown>) {
  for (const key of ["image_url", "imageUrl", "thumbnail_url", "thumbnailUrl"]) {
    const value = metadata[key];
    if (typeof value === "string" && /^https:\/\//.test(value)) return value;
  }
  return null;
}
export type StockDocumentLine = { item_id: string; name: string; quantity: number; unit: string; unit_price?: number };
export function validateMenuItem(form: FormData) {
  if(!String(form.get("name")??"").trim()||String(form.get("name")).length>200) throw new Error("商品名を200文字以内で入力してください。");
  if(!String(form.get("unit")??"").trim()||String(form.get("unit")).length>30) throw new Error("単位を30文字以内で入力してください。");
  for(const key of ["unit_price","cost_price","quantity","reorder_point"]) {
    if(!form.has(key))continue;
    const value=Number(form.get(key));
    if(!Number.isFinite(value)||value<0||value>100000000)throw new Error("価格・数量は0以上の数値で入力してください。");
  }
  if(!["inclusive","exclusive"].includes(String(form.get("tax_inclusion")))||![0,8,10].includes(Number(form.get("tax_rate"))))throw new Error("税区分を確認してください。");
  if(!["active","inactive"].includes(String(form.get("status")))||!["product","part","service"].includes(String(form.get("item_type"))))throw new Error("商品区分を確認してください。");
}
export function parseStockLines(form: FormData, manager: boolean): StockDocumentLine[] {
  const ids = form.getAll("item_id"), names = form.getAll("line_name"), quantities = form.getAll("quantity"), units = form.getAll("unit"), prices = form.getAll("unit_price");
  const lines = ids.map((id, index) => ({ item_id: String(id), name: String(names[index] ?? "").slice(0, 200), quantity: Number(quantities[index]), unit: String(units[index] ?? "").trim(), ...(manager ? { unit_price: Number(prices[index] ?? 0) } : {}) }));
  if (!lines.length || lines.length > 100) throw new Error("商品を1〜100件選んでください。");
  if (new Set(lines.map(line => line.item_id)).size !== lines.length) throw new Error("同じ商品は数量をまとめてください。");
  for (const line of lines) {
    if(!line.item_id) throw new Error("未選択の商品があります。対象を選ぶか、この行を除外してください。");
    if (!Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 1000000 || Math.abs(line.quantity * 100 - Math.round(line.quantity * 100)) > 0.00001) throw new Error("数量は0より大きく、小数2桁までで入力してください。");
    if (!line.unit || line.unit.length > 30) throw new Error("単位を確認してください。");
    if (manager && (!Number.isFinite(line.unit_price) || line.unit_price! < 0 || line.unit_price! > 100000000)) throw new Error("単価を確認してください。");
  }
  return lines;
}
