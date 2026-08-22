export type InitialSetupMenuInput = {
  sourceKey: string;
  enabled: boolean;
  name: string;
  itemType: "product" | "part" | "service";
  unitPrice: number;
  taxRate: 0 | 8 | 10;
  taxInclusion: "inclusive" | "exclusive";
};

export type InitialSetupInput = {
  storeName: string;
  industryTypeKey: string;
  address: string;
  phone: string;
  websiteUrl: string;
  description: string;
  invoiceIssuerName: string;
  invoiceRegistrationNumber: string;
  invoicePrefix: string;
  menus: InitialSetupMenuInput[];
};

export type InitialSetupAccess = {
  accountActive: boolean;
  isPlatformAdmin: boolean;
  organizationRoles: Record<string, string>;
};

const menuTypes = new Set(["product", "part", "service"]);
const taxRates = new Set([0, 8, 10]);
const taxInclusions = new Set(["inclusive", "exclusive"]);

function text(formData: FormData, key: string, max: number) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function money(formData: FormData, key: string) {
  const value = Number(formData.get(key) ?? 0);
  if (!Number.isFinite(value) || value < 0 || value > 100_000_000) {
    throw new Error("メニューの金額は0円以上で入力してください。");
  }
  return Math.round(value);
}

export function mayConfirmInitialSetup(access: InitialSetupAccess | null, organizationId: string) {
  return Boolean(
    access?.accountActive
    && !access.isPlatformAdmin
    && access.organizationRoles[organizationId] === "org_owner"
  );
}

export function initialSetupCandidateKey(snapshotId: string, index: number) {
  if (!snapshotId || !Number.isInteger(index) || index < 0 || index >= 30) {
    throw new Error("初期設定候補を確認できません。");
  }
  return `initial-setup:${snapshotId}:${index}`;
}

export function parseInitialSetupForm(formData: FormData, snapshotId: string, candidateCount: number): InitialSetupInput {
  if (formData.get("final_confirmation") !== "on") {
    throw new Error("内容を確認し、正式データへの反映に同意してください。");
  }
  const storeName = text(formData, "store_name", 160);
  const industryTypeKey = text(formData, "industry_type_key", 80);
  const invoiceIssuerName = text(formData, "invoice_issuer_name", 160);
  const invoiceRegistrationNumber = text(formData, "invoice_registration_number", 32).toUpperCase();
  const invoicePrefix = text(formData, "invoice_prefix", 20).toUpperCase();
  const websiteUrl = text(formData, "website_url", 2_000);
  if (!storeName) throw new Error("店舗名を入力してください。");
  if (!industryTypeKey) throw new Error("業種を選択してください。");
  if (!invoiceIssuerName) throw new Error("請求書に表示する事業者名を入力してください。");
  if (invoiceRegistrationNumber && !/^T\d{13}$/.test(invoiceRegistrationNumber)) {
    throw new Error("適格請求書発行事業者の登録番号は、Tと13桁の数字で入力してください。");
  }
  if (!/^[A-Z0-9-]{1,20}$/.test(invoicePrefix)) {
    throw new Error("請求書番号の先頭文字は、英数字とハイフンで入力してください。");
  }
  if (websiteUrl) {
    try {
      const parsed = new URL(websiteUrl);
      if (!(["http:", "https:"] as string[]).includes(parsed.protocol)) throw new Error("unsupported protocol");
    } catch {
      throw new Error("店舗サイトは http:// または https:// で始まるURLを入力してください。");
    }
  }

  const menus: InitialSetupMenuInput[] = [];
  const boundedCount = Math.min(Math.max(0, candidateCount), 30);
  for (let index = 0; index < boundedCount; index += 1) {
    const enabled = formData.get(`menu_enabled_${index}`) === "on";
    const name = text(formData, `menu_name_${index}`, 160);
    const rawType = text(formData, `menu_type_${index}`, 20);
    const itemType = menuTypes.has(rawType) ? rawType as InitialSetupMenuInput["itemType"] : "service";
    const rawTaxRate = Number(formData.get(`menu_tax_rate_${index}`) ?? 10);
    const taxRate = taxRates.has(rawTaxRate) ? rawTaxRate as InitialSetupMenuInput["taxRate"] : 10;
    const rawTaxInclusion = text(formData, `menu_tax_inclusion_${index}`, 20);
    const taxInclusion = taxInclusions.has(rawTaxInclusion)
      ? rawTaxInclusion as InitialSetupMenuInput["taxInclusion"]
      : "inclusive";
    if (enabled && !name) throw new Error("登録するメニュー候補の名称を入力してください。");
    menus.push({
      sourceKey: initialSetupCandidateKey(snapshotId, index),
      enabled,
      name,
      itemType,
      unitPrice: money(formData, `menu_unit_price_${index}`),
      taxRate,
      taxInclusion
    });
  }

  return {
    storeName,
    industryTypeKey,
    address: text(formData, "address", 240),
    phone: text(formData, "phone", 80),
    websiteUrl,
    description: text(formData, "description", 2_000),
    invoiceIssuerName,
    invoiceRegistrationNumber,
    invoicePrefix,
    menus
  };
}
