"use client";

import { useState } from "react";

export function AiGenerator({
  endpoint,
  storeId,
  title,
  fields
}: {
  endpoint: string;
  storeId: string;
  title: string;
  fields: Array<{ key: string; label: string; type?: "text" | "textarea" | "number"; placeholder?: string }>;
}) {
  const [result, setResult] = useState<string>("生成結果がここに表示されます。");
  const [loading, setLoading] = useState(false);

  async function submit(formData: FormData) {
    setLoading(true);
    const input = Object.fromEntries(formData.entries());

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId, input })
    });

    const data = await response.json();
    setResult(JSON.stringify(data.output ?? data.error, null, 2));
    setLoading(false);
  }

  return (
    <div className="grid cols-2">
      <form className="card form" action={submit}>
        <h3>{title}</h3>
        {fields.map((field) => (
          <div className="field" key={field.key}>
            <label htmlFor={field.key}>{field.label}</label>
            {field.type === "textarea" ? (
              <textarea id={field.key} name={field.key} placeholder={field.placeholder} required />
            ) : (
              <input id={field.key} name={field.key} placeholder={field.placeholder} type={field.type ?? "text"} required />
            )}
          </div>
        ))}
        <button className="button" disabled={loading} type="submit">
          {loading ? "生成中" : "生成する"}
        </button>
      </form>
      <section className="card">
        <h3>生成結果</h3>
        <pre className="result">{result}</pre>
      </section>
    </div>
  );
}
