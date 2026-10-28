"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./airregi-connect-form.module.css";

type Result = { externalStoreId?: string; error?: string; connected?: boolean };
export function AirRegiConnectForm({ storeId, storeName, action }: {
  storeId: string; storeName: string;
  action: (storeId: string, form: FormData) => Promise<Result>;
}) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [verified, setVerified] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [noOverlap, setNoOverlap] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  function edit(setter: (value: string) => void, value: string) {
    setter(value); setVerified(null); setConfirmed(false); setNoOverlap(false); setError(null);
  }
  return <form onSubmit={async event => {
    event.preventDefault();
    if (inFlight.current || verified && (!confirmed || !noOverlap)) return;
    inFlight.current = true;
    const form = new FormData(event.currentTarget);
    form.set("intent", verified ? "connect" : "probe");
    if (verified) form.set("confirmedExternalStoreId", verified);
    setPending(true); setError(null);
    try {
      const result = await action(storeId, form);
      if (result.error) { setError(result.error); return; }
      if (result.connected) {
        setApiKey(""); setApiToken(""); setVerified(null); setConfirmed(false); setNoOverlap(false);
        router.push(`/stores/${storeId}/settings/integrations/airregi?done=connect`); router.refresh();
      } else if (result.externalStoreId) setVerified(result.externalStoreId);
    } catch { setError("接続を確認できませんでした。時間をおいてお試しください。"); }
    finally { inFlight.current = false; setPending(false); }
  }} aria-busy={pending}>
    <h2>この店舗のAirレジを接続</h2>
    <p>Airレジの「データ連携API」で発行した接続情報を入力します。AirIDのパスワードは入力しないでください。</p>
    <fieldset disabled={pending} className={styles.fields}>
      <label className={styles.field}>APIキー<input name="apiKey" type="password" autoComplete="off" required maxLength={8192} value={apiKey} onChange={event => edit(setApiKey, event.target.value)} /></label>
      <label className={styles.field}>APIトークン<input name="apiToken" type="password" autoComplete="off" required maxLength={8192} value={apiToken} onChange={event => edit(setApiToken, event.target.value)} /></label>
      {verified ? <div className={`notice ${styles.confirmation}`}>
        <p>接続先のAirレジ店舗番号：<strong>{verified}</strong></p>
        <p>Airレジ側の店舗番号と一致することを確認してください。</p>
        <label className={styles.checkbox}><input type="checkbox" name="consent" value="yes" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required />このAirレジを「{storeName}」に紐付け、売上の読み取り連携に同意します。</label>
        <label className={styles.checkbox}><input type="checkbox" name="noOverlap" value="yes" checked={noOverlap} onChange={event => setNoOverlap(event.target.checked)} required />同じ期間のAirレジ売上を、CSVなどから取り込んでいないことを確認しました。</label>
        <p className="muted">取り込み済みなら、二重計上を防ぐため接続を進めず、AIOb運営へ切り替え期間をご相談ください。</p>
      </div> : null}
      {error ? <p className="notice danger" role="alert">{error}</p> : null}
      <button className="button" type="submit" disabled={pending || Boolean(verified && (!confirmed || !noOverlap))}>{pending ? "接続を確認しています…" : verified ? "この店舗に接続" : "接続先を確認"}</button>
    </fieldset>
    <p className="muted">最初は過去の売上を順に取り込み、その後は差分を確認します。レジの書き換え・決済・返金操作は行いません。商品マスターと勤怠は連携対象外です。</p>
  </form>;
}
