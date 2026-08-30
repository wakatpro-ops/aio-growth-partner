import fs from "node:fs";

const files = {
  css: fs.readFileSync("app/globals.css", "utf8"),
  dashboard: fs.readFileSync("components/dashboard/store-command-center.tsx", "utf8"),
  shell: fs.readFileSync("components/layout/app-shell.tsx", "utf8"),
  assistant: fs.readFileSync("components/store-ai/store-ai-assistant.tsx", "utf8"),
  robot: fs.readFileSync("components/brand/ai-robot.tsx", "utf8")
};

const portrait = "public/brand/aio-boost-robot-assistant.png";
const face = "public/brand/aio-boost-robot-face.png";
const checks = [
  ["透過ロボット画像をWeb用に配置", fs.existsSync(portrait) && fs.existsSync(face)],
  ["ロボット画像を軽量化", fs.statSync(portrait).size < 250_000 && fs.statSync(face).size < 100_000],
  ["大きなロボットは店舗トップだけ", files.dashboard.includes("AiRobotPortrait") && !files.shell.includes("AiRobotPortrait") && !files.assistant.includes("AiRobotPortrait")],
  ["サイドバーは顔アイコン", files.shell.includes("<AiRobotFace />")],
  ["AIチャットは顔アイコン", files.assistant.includes("assistant-header-avatar") && files.assistant.includes("message-avatar")],
  ["用途別の色を定義", ["--ai:", "--ai-soft:", "--warning:", "--danger:"].every((token) => files.css.includes(token))],
  ["カードと操作の共通半径", files.css.includes("--radius-card") && files.css.includes("--radius-control")],
  ["モバイル4段階に対応", ["max-width: 900px", "max-width: 680px", "max-width: 480px", "max-width: 340px"].every((token) => files.css.includes(token))],
  ["モバイルAIチャットを画面内に固定", files.css.includes("height: 100dvh") && files.css.includes("env(safe-area-inset-bottom)")],
  ["ロボットのPC・モバイル寸法を制限", files.robot.includes("(max-width: 680px) 90px, 160px") && files.css.includes("grid-template-columns: 72px minmax(0, 1fr)")],
  ["画像には意味のない代替文を付けない", files.robot.includes('alt=""') && files.robot.includes('aria-hidden="true"')]
];

const failed = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"}: ${label}`);
if (failed.length) process.exit(1);
console.log(`デザインシステムチェック: ${checks.length}/${checks.length} PASS`);
