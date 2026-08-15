export type SearchVisibilitySource = "search_console" | "manual";
export type SearchVisibilityPeriodKind = "baseline" | "current";

export type SearchVisibilitySetting = {
  id: string;
  organization_id: string;
  store_id: string;
  baseline_date: string;
  comparison_days: number;
  search_console_property_uri: string | null;
  country_filter: string;
  device_filter: string;
  status: "draft" | "connected" | "needs_reconnect" | "error";
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type SearchVisibilityKeyword = {
  id: string;
  organization_id: string;
  store_id: string;
  keyword: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type SearchVisibilitySnapshot = {
  id: string;
  organization_id: string;
  store_id: string;
  keyword_id: string;
  source: SearchVisibilitySource;
  period_kind: SearchVisibilityPeriodKind;
  period_start: string;
  period_end: string;
  country_filter: string;
  device_filter: string;
  clicks: number;
  impressions: number;
  ctr: number;
  average_position: number | null;
  fetched_at: string;
  created_at: string;
};

export type SearchVisibilityComparison = {
  keyword: SearchVisibilityKeyword;
  baseline: SearchVisibilitySnapshot | null;
  current: SearchVisibilitySnapshot | null;
};

export type ResultsVisibilityWorkspace = {
  storageReady: boolean;
  setting: SearchVisibilitySetting | null;
  keywords: SearchVisibilityKeyword[];
  archivedKeywords: SearchVisibilityKeyword[];
  comparisons: SearchVisibilityComparison[];
  googleConnected: boolean;
  searchConsoleScopeGranted: boolean;
  completedImprovements: Array<{
    id: string;
    title: string;
    change_summary: string | null;
    completed_at: string | null;
  }>;
};
