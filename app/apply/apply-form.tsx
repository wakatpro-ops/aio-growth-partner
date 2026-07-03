"use client";

import { useState } from "react";

export function ApplyForm() {
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    setMessage(data.ok ? "申し込みを受け付けました。" : data.error ?? "送信に失敗しました。");
  }

  return (
    <form className="card form" action={submit}>
      <div className="grid cols-2">
        <div className="field">
          <label htmlFor="store_name">店舗名</label>
          <input id="store_name" name="store_name" required />
        </div>
        <div className="field">
          <label htmlFor="contact_name">担当者名</label>
          <input id="contact_name" name="contact_name" required />
        </div>
        <div className="field">
          <label htmlFor="email">メール</label>
          <input id="email" name="email" type="email" required />
        </div>
        <div className="field">
          <label htmlFor="phone">電話番号</label>
          <input id="phone" name="phone" />
        </div>
        <div className="field">
          <label htmlFor="industry_type_key">業態</label>
          <select id="industry_type_key" name="industry_type_key" defaultValue="general_store">
            <option value="general_store">汎用店舗</option>
            <option value="auto_repair">自動車修理</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="store_count">店舗数</label>
          <input id="store_count" name="store_count" type="number" defaultValue="1" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="pain_points">課題</label>
        <textarea id="pain_points" name="pain_points" required />
      </div>
      <div className="field">
        <label htmlFor="message">備考</label>
        <textarea id="message" name="message" />
      </div>
      <button className="button" type="submit">送信</button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}
