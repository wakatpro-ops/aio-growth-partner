import "server-only";
import type { AirRegiAdapter } from "./contracts";
import { createAirRegiBridge } from "./bridge";

/** No direct provider call from a shared/dynamic egress deployment. */
export function getAirRegiAdapter(): AirRegiAdapter | null {
  return createAirRegiBridge();
}

export function requireAirRegiAdapter() {
  const adapter = getAirRegiAdapter();
  if (!adapter) throw new Error("Airレジ連携は接続環境の準備中です。");
  if (!adapter.specificationVersion || !Number.isInteger(adapter.minimumIntervalSeconds) || adapter.minimumIntervalSeconds < 60) {
    throw new Error("Airレジの同期設定を確認できません。");
  }
  return adapter;
}
