import type { ExtractedStoreProfile } from "./page-extraction.ts";
import type { FeatureFlags } from "../../types/domain.ts";

export const structureModes = ["single_store", "multi_store", "multi_brand", "multi_company"] as const;
export const authorityModes = ["aio_boost", "external", "file_import", "manual", "not_managed", "undecided"] as const;
export const registerModes = ["external_pos", "file_import", "simple_register", "not_needed", "undecided"] as const;
export const serviceModes = ["reservation_only", "walk_in_only", "both", "remote_or_visit", "not_used"] as const;
export const resourceModes = ["staff", "seat", "room", "equipment", "table", "vehicle", "other"] as const;
export const sharingScopes = ["company", "brand", "store"] as const;
export const systemKeys = ["sales", "reservations", "customers", "inventory", "accounting"] as const;
export const sharingKeys = ["menus", "invoices", "customers", "staff", "inventory"] as const;

type StructureMode = typeof structureModes[number];
type AuthorityMode = typeof authorityModes[number];
type RegisterMode = typeof registerModes[number];
type ServiceMode = typeof serviceModes[number];
type ResourceMode = typeof resourceModes[number];
type SharingScope = typeof sharingScopes[number];
type SystemKey = typeof systemKeys[number];
type SharingKey = typeof sharingKeys[number];

export type OperatingLocation = {
  name: string;
  address: string;
  websiteUrl: string;
  companyName: string;
  brandName: string;
  source: "published" | "applicant";
};

export type OperatingModel = {
  version: 1;
  structure: { mode: StructureMode; companyNames: string[]; brandNames: string[]; locations: OperatingLocation[] };
  systems: Record<SystemKey, { authority: AuthorityMode; serviceNames: string[] }>;
  register: { mode: RegisterMode };
  operations: { serviceMode: ServiceMode; reservationResources: ResourceMode[] };
  sharing: Record<SharingKey, SharingScope>;
  detection: { source: "ai" | "rules" | "applicant"; notes: string[] };
  applicantConfirmedAt?: string;
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function list(value: unknown, maxItems = 10, maxLength = 160) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => text(item, maxLength)).filter(Boolean))).slice(0, maxItems)
    : [];
}

function choice<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return allowed.includes(String(value) as T[number]) ? String(value) as T[number] : fallback;
}

function normalizeLocation(value: unknown, fallbackSource: OperatingLocation["source"]): OperatingLocation | null {
  const item = record(value);
  const name = text(item.name);
  const address = text(item.address, 240);
  const websiteUrl = text(item.websiteUrl ?? item.website_url, 2_000);
  if (!name && !address && !websiteUrl) return null;
  return {
    name,
    address,
    websiteUrl,
    companyName: text(item.companyName ?? item.company_name),
    brandName: text(item.brandName ?? item.brand_name),
    source: item.source === "applicant" ? "applicant" : fallbackSource
  };
}

export function defaultOperatingModel(): OperatingModel {
  return {
    version: 1,
    structure: { mode: "single_store", companyNames: [], brandNames: [], locations: [] },
    systems: Object.fromEntries(systemKeys.map((key) => [key, { authority: "aio_boost", serviceNames: [] as string[] }])) as unknown as OperatingModel["systems"],
    register: { mode: "undecided" },
    operations: { serviceMode: "both", reservationResources: ["staff"] },
    sharing: Object.fromEntries(sharingKeys.map((key) => [key, "store"])) as unknown as OperatingModel["sharing"],
    detection: { source: "rules", notes: [] }
  };
}

export function normalizeOperatingModel(value: unknown, fallback = defaultOperatingModel()): OperatingModel {
  const root = record(value);
  const structure = record(root.structure);
  const systems = record(root.systems);
  const operations = record(root.operations);
  const sharing = record(root.sharing);
  const detection = record(root.detection);
  const locations = Array.isArray(structure.locations)
    ? structure.locations.map((item) => normalizeLocation(item, "published")).filter((item): item is OperatingLocation => Boolean(item)).slice(0, 10)
    : fallback.structure.locations;
  return {
    version: 1,
    structure: {
      mode: choice(structure.mode, structureModes, fallback.structure.mode),
      companyNames: list(structure.companyNames ?? structure.company_names, 5),
      brandNames: list(structure.brandNames ?? structure.brand_names, 5),
      locations
    },
    systems: Object.fromEntries(systemKeys.map((key) => {
      const item = record(systems[key]);
      return [key, {
        authority: choice(item.authority, authorityModes, fallback.systems[key].authority),
        serviceNames: list(item.serviceNames ?? item.service_names, 8, 100)
      }];
    })) as unknown as OperatingModel["systems"],
    register: { mode: choice(record(root.register).mode, registerModes, fallback.register.mode) },
    operations: {
      serviceMode: choice(operations.serviceMode ?? operations.service_mode, serviceModes, fallback.operations.serviceMode),
      reservationResources: Array.isArray(operations.reservationResources ?? operations.reservation_resources)
        ? list(operations.reservationResources ?? operations.reservation_resources, 7, 30)
          .filter((item): item is ResourceMode => resourceModes.includes(item as ResourceMode))
        : fallback.operations.reservationResources
    },
    sharing: Object.fromEntries(sharingKeys.map((key) => [key, choice(sharing[key], sharingScopes, fallback.sharing[key])])) as unknown as OperatingModel["sharing"],
    detection: {
      source: choice(detection.source, ["ai", "rules", "applicant"] as const, fallback.detection.source),
      notes: list(detection.notes, 12, 240)
    },
    ...(text(root.applicantConfirmedAt ?? root.applicant_confirmed_at, 40)
      ? { applicantConfirmedAt: text(root.applicantConfirmedAt ?? root.applicant_confirmed_at, 40) }
      : {})
  };
}

export function buildOperatingModelDraft(profile: ExtractedStoreProfile, source: "ai" | "rules" = "rules"): OperatingModel {
  const model = defaultOperatingModel();
  const locations = profile.location_candidates.map((item) => normalizeLocation(item, "published")).filter((item): item is OperatingLocation => Boolean(item));
  const companyNames = list([profile.company_name, ...locations.map((item) => item.companyName)], 5);
  const brandNames = list(locations.map((item) => item.brandName), 5);
  const locationCount = locations.length;
  model.structure = {
    mode: companyNames.length > 1 ? "multi_company" : brandNames.length > 1 ? "multi_brand" : locationCount > 1 ? "multi_store" : "single_store",
    companyNames,
    brandNames,
    locations
  };
  for (const key of systemKeys) {
    const names = profile.detected_systems[key] ?? [];
    model.systems[key] = { authority: names.length ? "external" : "aio_boost", serviceNames: names };
  }
  model.register.mode = model.systems.sales.serviceNames.length ? "external_pos" : "undecided";
  const signals = profile.operating_signals;
  model.operations.serviceMode = signals.reservation && signals.walk_in ? "both" : signals.reservation ? "reservation_only" : signals.walk_in ? "walk_in_only" : "both";
  model.operations.reservationResources = ([signals.staff && "staff", signals.room && "room", signals.equipment && "equipment", signals.table && "table"]
    .filter(Boolean) as ResourceMode[]);
  if (!model.operations.reservationResources.length) model.operations.reservationResources = ["staff"];
  model.detection = {
    source,
    notes: [
      locationCount > 1 ? `公開ページから${locationCount}店舗の候補を確認しました。` : "公開ページ上の店舗構成は申込者の確認が必要です。",
      ...systemKeys.flatMap((key) => model.systems[key].serviceNames.map((name) => `${key}: ${name}`))
    ].slice(0, 12)
  };
  return model;
}

export function operatingModelFeatureFlags(modelValue: unknown): FeatureFlags {
  const model = normalizeOperatingModel(modelValue);
  if (model.register.mode === "simple_register") {
    return { simple_register: true, order_workflow: true, order_management: true, payment_management: true, product_management: true, invoice_management: true };
  }
  if (model.register.mode === "external_pos") {
    return { simple_register: false, pos_api_integrations: true, data_imports: true, csv_import: true, excel_import: true, sales_reports: true };
  }
  if (model.register.mode === "file_import") {
    return { simple_register: false, data_imports: true, csv_import: true, excel_import: true, sales_reports: true };
  }
  return { simple_register: false };
}
