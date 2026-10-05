import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

test("folded tools open on Next links, repeated same hash and initial bookmarks", () => {
  const listeners = new Map();
  let effect, scrolled = 0;
  const target = { scrollIntoView: () => scrolled++ };
  const details = { open: false, contains: element => element === target };
  const location = new URL("https://example.test/store/reviews#review-tools");
  class Element {
    constructor(href) { this.href = href; }
    closest() { return this; }
    getAttribute(name) { return name === "href" ? this.href : null; }
  }
  const events = {
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: name => listeners.delete(name)
  };
  const document = { ...events, getElementById: id => id === "review-tools" ? target : null };
  const module = { exports: {} };
  const js = ts.transpileModule(readFileSync("components/marketing/aio-function-list.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", "window", "document", "Element", js)(name => name === "react" ? {
    useRef: () => ({ current: details }), useEffect: callback => { effect = callback; }
  } : { jsx: () => null, jsxs: () => null }, module, module.exports, { ...events, location }, document, Element);
  module.exports.AioFunctionList({ children: null, alerts: 0 });
  const cleanup = effect();
  assert(details.open); assert.equal(scrolled, 1);
  const click = href => listeners.get("click")({ button: 0, target: new Element(href) });
  details.open = false; click("/store/reviews#review-tools");
  assert(details.open); assert.equal(scrolled, 2);
  details.open = false; click("/another-store/reviews#review-tools"); assert(!details.open);
  click("https://foreign.test/store/reviews#review-tools"); assert(!details.open);
  click("/store/reviews?filter=all#review-tools"); assert(!details.open);
  listeners.get("hashchange")(); assert(details.open);
  cleanup(); assert.equal(listeners.size, 0);
});
