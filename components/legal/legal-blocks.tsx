import Link from "next/link";
import { companyInformation, legalLinks } from "@/lib/legal/content";

function companyValue(value: string) {
  if (value.startsWith("https://")) {
    return <a href={value} rel="noreferrer" target="_blank">{value}</a>;
  }
  if (value.includes("@")) {
    return <a href={`mailto:${value}`}>{value}</a>;
  }
  return value;
}

export function CompanyInformationCard() {
  return (
    <section className="card legal-card">
      <h2>事業者情報</h2>
      <p className="muted">AIO boostは株式会社 Navi Lifeが運営しています。</p>
      <table className="table compact">
        <tbody>
          {companyInformation.map(([label, value]) => (
            <tr key={label}>
              <th>{label}</th>
              <td>{companyValue(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function LegalNavCards() {
  return (
    <section className="grid cols-2">
      {legalLinks.map((item) => (
        <Link className="card legal-link-card" href={item.href} key={item.href}>
          <h2>{item.label}</h2>
          <p>{item.body}</p>
        </Link>
      ))}
    </section>
  );
}

export function LegalSections({ sections }: { sections: Array<{ title: string; items: string[] }> }) {
  return (
    <div className="legal-document">
      {sections.map((section) => (
        <section className="card legal-card" key={section.title}>
          <h2>{section.title}</h2>
          <ul className="compact-list">
            {section.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}
