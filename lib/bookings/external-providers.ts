import type {
  ExternalBookingConnectionMode,
  ExternalBookingConnectionStatus,
  ExternalBookingProviderKey
} from "@/types/external-booking";

export type ExternalBookingProvider = {
  key: ExternalBookingProviderKey;
  name: string;
  availabilityLabel: string;
  mode: ExternalBookingConnectionMode;
  summary: string;
  requirements: string[];
  capabilities: {
    reservations: "read" | "contract" | "unconfirmed";
    customers: "read" | "contract" | "unconfirmed";
    writeBack: false;
  };
  officialUrl: string;
  inquiryUrl: string;
};

export const externalBookingProviders: ExternalBookingProvider[] = [
  {
    key: "stores_reservation",
    name: "STORES 予約",
    availabilityLabel: "公式APIあり（読み取り専用）",
    mode: "official_read_api",
    summary: "公式REST APIで予約・顧客情報を取得できます。作成・更新・削除はできません。",
    requirements: ["STORESへのAPI利用申請", "対象プランの確認（ビジネスプラン以上）", "店舗ごとのAPIキーとmerchant_canonical_id"],
    capabilities: { reservations: "read", customers: "read", writeBack: false },
    officialUrl: "https://reserve-faq.stores.jp/hc/ja/articles/28752603270297-STORES-%E4%BA%88%E7%B4%84%E3%81%AEAPI%E6%A9%9F%E8%83%BD%E3%81%AE%E6%A6%82%E8%A6%81%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6",
    inquiryUrl: "https://reserve-faq.stores.jp/hc/ja/requests/new"
  },
  {
    key: "reserva",
    name: "RESERVA",
    availabilityLabel: "個別契約APIあり",
    mode: "contract_api",
    summary: "予約・顧客情報のAPI連携がありますが、スイートプラン以上かつ料金・仕様は個別確認です。",
    requirements: ["RESERVAスイートプラン以上", "API利用の見積・契約", "対象予約サイトと接続仕様の確認"],
    capabilities: { reservations: "contract", customers: "contract", writeBack: false },
    officialUrl: "https://biz.reserva.be/price/",
    inquiryUrl: "https://biz.reserva.be/contact/"
  },
  {
    key: "minimo",
    name: "minimo",
    availabilityLabel: "提携連携あり・公開APIなし",
    mode: "partner_inquiry",
    summary: "公式サロンツールは複数の予約管理システムと連携しますが、一般公開の開発者APIは確認できません。",
    requirements: ["minimoへのシステム連携可否の照会", "提携審査と仕様書の受領", "店舗アカウントの管理権限"],
    capabilities: { reservations: "contract", customers: "unconfirmed", writeBack: false },
    officialUrl: "https://minimodel.jp/info/salon",
    inquiryUrl: "https://minimodel.jp/info/faq"
  },
  {
    key: "hotpepper_beauty",
    name: "ホットペッパービューティー",
    availabilityLabel: "公開予約APIなし・提携確認が必要",
    mode: "partner_inquiry",
    summary: "リクルートの公開APIで確認できるのはグルメ系で、ビューティー予約の公開APIは確認できません。",
    requirements: ["リクルート／SALON BOARDへの連携可否の照会", "提携契約と仕様書の受領", "店舗による管理権限の確認"],
    capabilities: { reservations: "contract", customers: "unconfirmed", writeBack: false },
    officialUrl: "https://webservice.recruit.co.jp/doc/hotpepper/",
    inquiryUrl: "https://salonboard.com/faq/"
  },
  {
    key: "rakuten_beauty",
    name: "楽天ビューティ",
    availabilityLabel: "公開予約APIを確認できず",
    mode: "partner_inquiry",
    summary: "楽天の公開Web Serviceに楽天ビューティ予約APIは掲載されていません。媒体担当への個別確認が必要です。",
    requirements: ["楽天ビューティ担当へのシステム連携照会", "契約・データ利用条件の確認", "店舗アカウントの管理権限"],
    capabilities: { reservations: "unconfirmed", customers: "unconfirmed", writeBack: false },
    officialUrl: "https://webservice.rakuten.co.jp/",
    inquiryUrl: "https://beauty.rakuten.co.jp/cnt/topics/bp/"
  },
  {
    key: "epark",
    name: "EPARK",
    availabilityLabel: "公開予約APIを確認できず",
    mode: "partner_inquiry",
    summary: "業種別の予約・順番待ちサービスはありますが、一般公開の予約API仕様は確認できません。",
    requirements: ["利用中のEPARKサービスを特定", "法人・提携窓口への連携照会", "契約・データ利用条件の確認"],
    capabilities: { reservations: "unconfirmed", customers: "unconfirmed", writeBack: false },
    officialUrl: "https://epark.co.jp/",
    inquiryUrl: "https://epark.co.jp/contact"
  },
  {
    key: "ozmall",
    name: "OZmall",
    availabilityLabel: "公開予約APIを確認できず",
    mode: "partner_inquiry",
    summary: "掲載・予約サービスとGoogleで予約の連携はありますが、店舗向け公開API仕様は確認できません。",
    requirements: ["OZのプレミアム予約担当への連携照会", "掲載審査・提携条件の確認", "店舗アカウントの管理権限"],
    capabilities: { reservations: "unconfirmed", customers: "unconfirmed", writeBack: false },
    officialUrl: "https://www.ozmall.co.jp/introduction/toiawase/29502/",
    inquiryUrl: "https://www.ozmall.co.jp/introduction/toiawase/29502/"
  },
  {
    key: "ekiten",
    name: "エキテン",
    availabilityLabel: "公開予約APIを確認できず",
    mode: "partner_inquiry",
    summary: "ネット予約とGoogleで予約の連携はありますが、第三者向けの公開予約API仕様は確認できません。",
    requirements: ["エキテン店舗管理者への連携照会", "契約・データ利用条件の確認", "店舗アカウントの管理権限"],
    capabilities: { reservations: "unconfirmed", customers: "unconfirmed", writeBack: false },
    officialUrl: "https://owner.ekiten.jp/guide-reserve-basic02/",
    inquiryUrl: "https://owner.ekiten.jp/free-basicplan02/"
  }
];

export const externalBookingProviderKeys = externalBookingProviders.map((provider) => provider.key);

export function getExternalBookingProvider(key: string) {
  return externalBookingProviders.find((provider) => provider.key === key) ?? null;
}

export const externalBookingStatusLabels: Record<ExternalBookingConnectionStatus, string> = {
  preparing: "申請準備中",
  awaiting_provider: "提供会社の回答待ち",
  credentials_required: "API情報の発行待ち",
  connection_test_required: "接続テスト待ち",
  connected_read_only: "読み取り接続済み",
  paused: "一時停止",
  error: "要確認"
};

export const userSelectableExternalBookingStatuses: ExternalBookingConnectionStatus[] = [
  "preparing",
  "awaiting_provider",
  "credentials_required",
  "connection_test_required",
  "paused",
  "error"
];
