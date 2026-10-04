import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(join(root, path), "utf8");
const expected = new Map([
  ["lib/openai/generate.ts", ["createMeteredOpenAI", "params.templateKey"]],
  ["lib/store-ai/assistant.ts", ["createMeteredOpenAI", '"assistant"']],
  ["lib/marketing/conversation.ts", ["createMeteredOpenAI", '"marketing_conversation"']],
  ["lib/marketing/aio-conversation.ts", ["createMeteredOpenAI", '"aio_conversation"']],
  ["lib/store-email/classifier.ts", ["createMeteredOpenAI", '"email_classification"']],
  ["lib/phase6/expense-receipts.ts", ["createMeteredOpenAI", '"receipt_extraction"']],
  ["lib/phase5/sns-publishing.ts", ["createMeteredOpenAI", '"sns_image_analysis"']],
  ["lib/applications/analysis.ts", ["createMeteredOpenAI", '"application_analysis"']],
  ["lib/applications/store-analysis.ts", ["createMeteredOpenAI", '"public_url_analysis"']],
  ["lib/results-visibility.ts", ["createMeteredFetch", '"ai_visibility"']]
]);

function* productionFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* productionFiles(path);
    else if (/\.tsx?$/u.test(entry.name)) yield path;
  }
}

const found = new Set();
for (const path of [...productionFiles(join(root, "lib")), ...productionFiles(join(root, "app"))]) {
  const name = relative(root, path).replaceAll("\\", "/");
  // The SDK's only direct construction belongs inside the metering boundary.
  if (name === "lib/ai-usage/meter.ts") continue;
  const source = readFileSync(path, "utf8");
  const tree = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
  const sdkBindings = new Set();
  for (const statement of tree.statements) {
    if (ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === "openai") {
      if (statement.importClause?.name) sdkBindings.add(statement.importClause.name.text);
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const item of bindings.elements) sdkBindings.add(item.name.text);
    }
  }
  const visit = node => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
      assert.ok(!sdkBindings.has(node.expression.text), `${name}: unmetered OpenAI constructor`);
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(tree);
      if (["createMeteredOpenAI", "createMeteredFetch"].includes(callee)) {
        assert.ok(expected.has(name), `${name}: add the new AI feature to the coverage manifest`);
        assert.equal(callee, expected.get(name)[0], `${name}: unexpected meter factory`);
        const metadata = node.arguments[0];
        assert.ok(metadata && ts.isObjectLiteralExpression(metadata), `${name}: explicit usage metadata is required`);
        const feature = metadata.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(tree) === "feature");
        assert.equal(feature?.initializer.getText(tree), expected.get(name)[1], `${name}: incorrect feature attribution`);
        for (const property of metadata.properties) {
          if (ts.isSpreadAssignment(property)) {
            assert.equal(property.expression.getText(tree), "attribution", `${name}: only the separate trusted attribution may be spread`);
          } else {
            assert.ok(["feature", "storeId", "organizationId", "userId"].includes(property.name.getText(tree)), `${name}: usage metadata must not include prompts, inputs or output bodies`);
          }
        }
        found.add(name);
      }
      const url = node.arguments[0];
      if (url && ts.isStringLiteralLike(url) && url.text.startsWith("https://api.openai.com/")) {
        assert.equal(name, "lib/results-visibility.ts", `${name}: unregistered direct OpenAI endpoint`);
        assert.equal(callee, "meteredFetch", `${name}: direct OpenAI fetch bypasses metering`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
}
assert.deepEqual([...found].sort(), [...expected.keys()].sort(), "Every production AI caller must be metered");

const route = read("app/api/stores/[storeId]/assistant/route.ts");
assert.match(route, /const user = await getCurrentUserAccess\(\)/u);
assert.match(route, /generateStoreAssistantAnswer\(context, parsed\.data, \{\s*storeId: access\.store\.id,\s*organizationId: access\.store\.organization_id,\s*userId: user\.userId/u);
assert.doesNotMatch(route, /(?:storeId|organizationId|userId): parsed\.data\./u);

const inbound = read("lib/store-email/inbound.ts");
assert.match(inbound, /classifyInboundStoreEmail\([^;]+storeId: inbox\.store_id,\s*organizationId: inbox\.organization_id/su);
assert.ok(inbound.indexOf('reason: "inactive_store"') < inbound.indexOf("const classified ="), "Email usage attribution must follow trusted store validation");

const receipt = read("lib/phase6/expense-receipts.ts");
assert.equal((receipt.match(/storeId: resolved\.storeId, organizationId: resolved\.organizationId, userId: access\.userId/gu) ?? []).length, 2, "Both receipt upload and reanalysis need trusted attribution");
assert.match(read("lib/phase5/sns-publishing.ts"), /analyzeAndCaption\([^;]+storeId: resolved\.storeId, organizationId: resolved\.organizationId, userId: access\.userId/su);

for (const file of ["lib/applications/analysis.ts", "lib/applications/store-analysis.ts"]) {
  const source = read(file);
  assert.equal((source.match(/createMeteredOpenAI\(/gu) ?? []).length, 1, `${file}: one client must span fallback attempts`);
  assert.ok(source.indexOf("const client = createMeteredOpenAI") < source.indexOf("for (const model of"), `${file}: do not reset attempt tracking inside the model loop`);
}
const assistant = read("lib/store-ai/assistant.ts");
assert.match(assistant, /timeout: 45_000, maxRetries: 0/u);
assert.match(assistant, /getChatModelOptions\(model, 1500\)/u);
const generic = read("lib/openai/generate.ts");
assert.ok(generic.indexOf("tokens = response.usage") < generic.indexOf("output = JSON.parse(content)"), "Usage must survive output JSON parsing errors");
assert.match(generic, /from\("ai_generation_logs"\)\.insert\(logRecord\)/u, "Keep existing generation logs");

console.log(`AI usage callsite coverage: all ${found.size} production callers use metering with trusted attribution.`);
