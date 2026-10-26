import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const css = fs.readFileSync("app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const reset = css.match(/:is\(([^{}]+)\)\s*>\s*:is\(\.card,\s*\.grid\)\s*\{([^{}]+)\}/);
const resetClasses = new Set(reset?.[1].match(/\.[\w-]+/g)?.map((name) => name.slice(1)));

test("gap-managed card spacing overrides sibling spacing without !important", () => {
  assert.ok(reset, "shared direct-child reset is required");
  assert.match(reset[2], /margin-top:\s*0\s*;/);
  assert.doesNotMatch(reset[2], /!important/);
  // Both :is() lists contribute one class, matching .card + .card specificity.
  // :where() would lose against the legacy selector even when declared later.
  assert.ok(css.indexOf(reset[0]) > css.indexOf(".card + .card"));
  for (const name of ["grid", "menu-card-grid", "booking-settings-grid", "visual-grid", "sales-kpi-strip"]) {
    assert.ok(resetClasses.has(name), `missing shared layout: ${name}`);
  }
});

test("normal-flow sections retain their existing 16px separation", () => {
  assert.match(css, /\.card \+ \.card,[^{}]*\.notice \+ \.grid\s*\{\s*margin-top:\s*16px;/);
  assert.doesNotMatch(reset[0], /\*|\s\.card\s*\{/);
});

test("collapsed feature tools also use the gap-managed stack", () => {
  const component = fs.readFileSync("components/marketing/aio-function-list.tsx", "utf8");
  assert.match(component, /<div className="stack">\{children\}<\/div>/);
});

test("all statically declared gap layouts containing cards/grids use the shared reset", () => {
  const gapLayouts = new Set();
  for (const match of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    if (!/display:\s*(grid|flex)\s*;/.test(match[2]) || !/\bgap:\s*[^;]+;/.test(match[2])) continue;
    for (const selector of match[1].split(",")) {
      const name = selector.trim().match(/^\.([\w-]+)$/)?.[1];
      if (name) gapLayouts.add(name);
    }
  }
  const uses = new Map();
  function scan(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) { scan(filename); continue; }
      if (!filename.endsWith(".tsx")) continue;
      const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function classes(node) {
        const opening = node && ts.isJsxElement(node) ? node.openingElement : node && ts.isJsxSelfClosingElement(node) ? node : null;
        const value = opening?.attributes.properties.find((attribute) => attribute.name?.getText(source) === "className")?.initializer;
        return value && ts.isStringLiteral(value) ? value.text.split(/\s+/) : [];
      }
      function visit(node) {
        if (classes(node).some((name) => name === "card" || name === "grid")) {
          let parent = node.parent;
          while (parent && !ts.isJsxElement(parent)) parent = parent.parent;
          for (const name of classes(parent).filter((name) => gapLayouts.has(name))) uses.set(name, filename);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  scan("app");
  scan("components");
  assert.ok(uses.size >= 20, "source scan must cover common and specialized layouts");
  const missing = [...uses].filter(([name]) => !resetClasses.has(name));
  assert.deepEqual(missing, [], "add new gap layouts to the shared reset; dynamic classes also require visual QA");
});
