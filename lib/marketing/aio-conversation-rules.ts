import type { Offer } from "./conversation-rules";
export type AioFacts = {
  missing: string[];
  activeTasks: { id: string; title: string; due_date: string | null; publication_status: string }[];
  hasGoal: boolean;
};
export function aioOffersFor(storeId: string, facts: AioFacts, today: string): Offer[] {
  const base = `/stores/${storeId}/marketing/aio-improvement`;
  const task = facts.activeTasks[0];
  return [
    ...(task ? [{ id: "continue", priority: task.due_date && task.due_date < today ? 110 : 90, weight: 1, text: `「${task.title}」が途中です。下書きや改善内容を確認して続けませんか？`, label: "続きを確認する", href: `${base}/tasks/${task.id}` }] : []),
    { id: "service", channel: "aio_service", priority: facts.missing.includes("offering") ? 80 : 50, weight: 3, text: "おすすめのメニュー・サービスを、検索やAIに伝わりやすい紹介文にしませんか？選ぶところから一緒に進めます。", label: "メニューを選んで作る" },
    { id: "profile", channel: "aio_profile", priority: facts.missing.includes("local") || facts.missing.includes("identity") ? 80 : 50, weight: 2, text: "お店の強みや、どんなお客様に合うかを整理しませんか？紹介したいメニューを選んで、説明の下書きを作れます。", label: "お店の強みを整理する" },
    { id: "questions", channel: "aio_questions", priority: !facts.hasGoal ? 75 : 45, weight: 1, text: "どんな質問でお店を見つけてもらいたいですか？メニューやサービスから、質問の候補を一緒に作りましょう。", label: "質問の候補を作る" },
    { id: "results", priority: 30, weight: 1, text: "取り組みの成果を確認してみませんか？取得できた実績から変化を見られます。", label: "成果を確認する", href: `/stores/${storeId}/results` }
  ];
}

export function parseAioDraft(body: string, questions: boolean) {
  const value = body.trim();
  if (!value || value.length > 2000) throw new Error("invalid_draft");
  if (!questions) return value;
  // Questions stay a draft until the separate, explicit target-question save.
  const lines = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 1 || lines.length > 3 || lines.some(line => line.length > 160)) throw new Error("invalid_questions");
  return lines.join("\n");
}
