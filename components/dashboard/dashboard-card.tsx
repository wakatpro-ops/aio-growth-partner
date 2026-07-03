export function DashboardCard({ title, body, metric }: { title: string; body: string; metric?: string }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      {metric ? <div className="metric">{metric}</div> : null}
      <p>{body}</p>
    </section>
  );
}
