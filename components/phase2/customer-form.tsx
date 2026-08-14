import Link from "next/link";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import type { Customer } from "@/types/phase2";

function vehicleValue(customer: Customer | null | undefined, key: string) {
  const value = customer?.vehicle_info?.[key];
  return typeof value === "string" ? value : "";
}

function tagsValue(customer: Customer | null | undefined) {
  return Array.isArray(customer?.tags) ? customer.tags.join("、") : "";
}

export function CustomerForm({
  action,
  customer,
  showVehicle,
  cancelHref
}: {
  action: (formData: FormData) => void;
  customer?: Customer | null;
  showVehicle: boolean;
  cancelHref: string;
}) {
  return (
    <form className="card form" action={action}>
      <div className="section-heading">
        <div><h2>基本情報</h2><p><span className="required-mark">必須</span>は名前と電話番号です。</p></div>
      </div>
      <div className="grid cols-2">
        <div className="field">
          <label htmlFor="name">名前 <span className="required-mark">必須</span></label>
          <input id="name" name="name" defaultValue={customer?.name} required />
        </div>
        <div className="field">
          <label htmlFor="customer_code">顧客番号</label>
          <input id="customer_code" name="customer_code" defaultValue={customer?.customer_code ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="company_name">会社名・屋号</label>
          <input id="company_name" name="company_name" defaultValue={customer?.company_name ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="phone">電話番号 <span className="required-mark">必須</span></label>
          <input id="phone" name="phone" type="tel" defaultValue={customer?.phone ?? ""} required />
        </div>
        <div className="field">
          <label htmlFor="email">メールアドレス</label>
          <input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="birth_date">生年月日・誕生日</label>
          <input id="birth_date" name="birth_date" type="date" defaultValue={customer?.birth_date ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="gender">性別</label>
          <select id="gender" name="gender" defaultValue={customer?.gender ?? ""}>
            <option value="">未登録</option>
            <option value="female">女性</option>
            <option value="male">男性</option>
            <option value="other">その他</option>
            <option value="prefer_not_to_say">回答しない</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="occupation">職業</label>
          <input id="occupation" name="occupation" defaultValue={customer?.occupation ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="assigned_staff_name">担当者</label>
          <input id="assigned_staff_name" name="assigned_staff_name" defaultValue={customer?.assigned_staff_name ?? ""} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="address">住所</label>
        <textarea id="address" name="address" defaultValue={customer?.address ?? ""} />
      </div>
      <div className="grid cols-2">
        <div className="field">
          <label htmlFor="last_visit_date">最終来店日</label>
          <input id="last_visit_date" name="last_visit_date" type="date" defaultValue={customer?.last_visit_date ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="visit_count">来店回数</label>
          <input id="visit_count" name="visit_count" type="number" min="0" step="1" defaultValue={customer?.visit_count ?? 0} />
        </div>
        <div className="field full-span">
          <label htmlFor="tags">タグ</label>
          <input id="tags" name="tags" defaultValue={tagsValue(customer)} placeholder="VIP、アロマ、平日希望（読点またはカンマ区切り）" />
        </div>
      </div>

      <section className="subsection">
        <h3>SNS・連絡方法</h3>
        <div className="grid cols-3">
          <div className="field"><label htmlFor="line_account">LINE</label><input id="line_account" name="line_account" defaultValue={customer?.line_account ?? ""} /></div>
          <div className="field"><label htmlFor="instagram_account">Instagram</label><input id="instagram_account" name="instagram_account" defaultValue={customer?.instagram_account ?? ""} /></div>
          <div className="field"><label htmlFor="facebook_account">Facebook</label><input id="facebook_account" name="facebook_account" defaultValue={customer?.facebook_account ?? ""} /></div>
        </div>
        <div className="field">
          <label htmlFor="preferred_channel">希望する連絡方法</label>
          <select id="preferred_channel" name="preferred_channel" defaultValue={customer?.preferred_channel ?? ""}>
            <option value="">未確認</option>
            <option value="phone">電話</option>
            <option value="email">メール</option>
            <option value="line">LINE</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
          </select>
        </div>
        <p className="notice">配信許可は本人に確認できたものだけチェックしてください。配信停止はすべての案内対象から除外されます。</p>
        <div className="grid cols-2">
          <label className="check-row"><input type="checkbox" name="email_opt_in" defaultChecked={Boolean(customer?.email_opt_in)} />メール配信の許可を確認済み</label>
          <label className="check-row"><input type="checkbox" name="line_opt_in" defaultChecked={Boolean(customer?.line_opt_in)} />LINE配信の許可を確認済み</label>
          <label className="check-row"><input type="checkbox" name="social_opt_in" defaultChecked={Boolean(customer?.social_opt_in)} />SNSでの連絡許可を確認済み</label>
          <label className="check-row"><input type="checkbox" name="do_not_contact" defaultChecked={Boolean(customer?.do_not_contact)} />配信停止・連絡しない</label>
        </div>
      </section>
      {showVehicle ? (
        <section className="subsection">
          <h3>車両情報</h3>
          <div className="grid cols-3">
            <div className="field">
              <label htmlFor="vehicle_maker">メーカー</label>
              <input id="vehicle_maker" name="vehicle_maker" defaultValue={vehicleValue(customer, "maker")} />
            </div>
            <div className="field">
              <label htmlFor="vehicle_model">車種</label>
              <input id="vehicle_model" name="vehicle_model" defaultValue={vehicleValue(customer, "model")} />
            </div>
            <div className="field">
              <label htmlFor="vehicle_plate">ナンバー</label>
              <input id="vehicle_plate" name="vehicle_plate" defaultValue={vehicleValue(customer, "plate")} />
            </div>
          </div>
        </section>
      ) : null}
      <div className="form-actions">
        <PendingSubmitButton pendingLabel="顧客情報を保存しています...">{customer ? "顧客情報の変更を保存" : "顧客を登録"}</PendingSubmitButton>
        <Link className="button secondary" href={cancelHref}>キャンセルして一覧へ戻る</Link>
      </div>
    </form>
  );
}
