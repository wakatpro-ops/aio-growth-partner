import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const blockedDirs = new Set(["node_modules", ".next", ".git"]);
const clientPatterns = [/app\/.*\.(tsx|ts)$/u, /components\/.*\.(tsx|ts)$/u, /lib\/supabase\/browser\.ts$/u];
const forbidden = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "SENDGRID_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_TOKEN_ENCRYPTION_KEY",
  "FREEE_CLIENT_SECRET"
];
const allowedFiles = new Set([
  "lib/supabase/admin.ts",
  "lib/openai/generate.ts",
  "app/api/applications/route.ts",
  "app/api/ai/post/route.ts",
  "app/api/ai/review-reply/route.ts",
  "app/api/ai/diagnosis/route.ts",
  "app/api/stripe/webhook/route.ts",
  "scripts/check-client-secrets.mjs"
]);

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    const relative = full.slice(root.length + 1);
    if (blockedDirs.has(entry)) return [];
    if (statSync(full).isDirectory()) return walk(full);
    return [relative];
  });
}

const violations = [];

for (const file of walk(root)) {
  if (!/\.(ts|tsx|js|mjs)$/u.test(file)) continue;
  if (allowedFiles.has(file)) continue;
  const isClientSurface = clientPatterns.some((pattern) => pattern.test(file));
  if (!isClientSurface) continue;
  const source = readFileSync(join(root, file), "utf8");
  for (const key of forbidden) {
    if (source.includes(key)) {
      violations.push(`${file}: ${key}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Client secret exposure risk found:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("No client-side references to server-only secret environment variables were found.");
