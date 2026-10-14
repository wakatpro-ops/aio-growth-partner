import "server-only";
import type { AirRegiAdapter } from "./contracts";

/** No guessed URL/header, no production mock, no user-controlled outbound URL.
 * Replace only after Recruit supplies an official specification and test access.
 */
export function getAirRegiAdapter(): AirRegiAdapter | null {
  return null;
}

export function requireAirRegiAdapter() {
  const adapter = getAirRegiAdapter();
  if (!adapter) throw new Error("Airレジ連携は提供元のAPI仕様確認待ちです。");
  if (!adapter.specificationVersion || !Number.isInteger(adapter.minimumIntervalSeconds) || adapter.minimumIntervalSeconds < 60) {
    throw new Error("Airレジの同期設定を確認できません。");
  }
  return adapter;
}
