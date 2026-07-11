import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import type { Customer } from "@/types/phase2";

function vehicleValue(customer: Customer | null | undefined, key: string) {
  const value = customer?.vehicle_info?.[key];
  return typeof value === "string" ? value : "";
}

export function CustomerForm({
  action,
  customer,
  showVehicle
}: {
  action: (formData: FormData) => void;
  customer?: Customer | null;
  showVehicle: boolean;
}) {
  return (
    <form className="card form" action={action}>
      <div className="grid cols-2">
        <div className="field">
          <label htmlFor="name">顧客名</label>
          <input id="name" name="name" defaultValue={customer?.name} required />
        </div>
        <div className="field">
          <label htmlFor="company_name">会社名</label>
          <input id="company_name" name="company_name" defaultValue={customer?.company_name ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="email">メール</label>
          <input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="phone">電話番号</label>
          <input id="phone" name="phone" defaultValue={customer?.phone ?? ""} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="address">住所</label>
        <textarea id="address" name="address" defaultValue={customer?.address ?? ""} />
      </div>
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
      <PendingSubmitButton pendingLabel="顧客情報を保存しています...">保存</PendingSubmitButton>
    </form>
  );
}
