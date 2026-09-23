import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DEFAULT_OPENAI_MODEL,
  getChatModelOptions,
  getOpenAiModel,
  getOpenAiModelCandidates,
  getOpenAiSearchModel,
  getResponsesModelOptions,
} from "../../lib/openai/models.ts";

const modelEnvKeys = ["OPENAI_MODEL", "OPENAI_SEARCH_MODEL"];

function withModelEnv(values, run) {
  const previous = Object.fromEntries(modelEnvKeys.map((key) => [key, process.env[key]]));

  try {
    for (const key of modelEnvKeys) {
      if (values[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = values[key];
      }
    }
    return run();
  } finally {
    for (const key of modelEnvKeys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

// These synchronous cases share process.env, so they must not run concurrently.
describe("OpenAI model selection", { concurrency: false }, () => {
  test("uses GPT-6 Luna as the default for both model selectors", () => {
    assert.equal(DEFAULT_OPENAI_MODEL, "gpt-6-luna");
    withModelEnv({}, () => {
      assert.equal(getOpenAiModel(), "gpt-6-luna");
      assert.equal(getOpenAiSearchModel(), "gpt-6-luna");
    });
  });

  test("treats empty and whitespace-only overrides as unset", () => {
    for (const value of ["", " ", "\t\n "]) {
      withModelEnv({ OPENAI_MODEL: value, OPENAI_SEARCH_MODEL: value }, () => {
        assert.equal(getOpenAiModel(), "gpt-6-luna");
        assert.equal(getOpenAiSearchModel(), "gpt-6-luna");
      });
    }
  });

  test("trims and preserves explicit model overrides", () => {
    withModelEnv({ OPENAI_MODEL: "  gpt-4.1-mini\n", OPENAI_SEARCH_MODEL: "\tgpt-5.4 " }, () => {
      assert.equal(getOpenAiModel(), "gpt-4.1-mini");
      assert.equal(getOpenAiSearchModel(), "gpt-5.4");
    });
  });

  test("does not use the general override for search requests", () => {
    for (const searchValue of [undefined, "", " \t"]) {
      withModelEnv({ OPENAI_MODEL: "gpt-4.1-mini", OPENAI_SEARCH_MODEL: searchValue }, () => {
        assert.equal(getOpenAiModel(), "gpt-4.1-mini");
        assert.equal(getOpenAiSearchModel(), "gpt-6-luna");
      });
    }
  });

  test("does not use the search override for general requests", () => {
    withModelEnv({ OPENAI_SEARCH_MODEL: "gpt-5.4" }, () => {
      assert.equal(getOpenAiModel(), "gpt-6-luna");
      assert.equal(getOpenAiSearchModel(), "gpt-5.4");
    });
  });

  test("reads current overrides instead of caching them at import time", () => {
    withModelEnv({ OPENAI_MODEL: "gpt-4o-mini", OPENAI_SEARCH_MODEL: "gpt-5.4" }, () => {
      assert.equal(getOpenAiModel(), "gpt-4o-mini");
      assert.equal(getOpenAiSearchModel(), "gpt-5.4");
      process.env.OPENAI_MODEL = "gpt-6-luna";
      process.env.OPENAI_SEARCH_MODEL = "gpt-6-luna";
      assert.equal(getOpenAiModel(), "gpt-6-luna");
      assert.equal(getOpenAiSearchModel(), "gpt-6-luna");
    });
  });

  test("returns the configured model first, followed by unique nonblank fallbacks", () => {
    const fallbacks = Object.freeze([
      " gpt-4.1-mini ",
      "gpt-4o-mini",
      "gpt-4.1-mini",
      "",
      " \t\n",
      " gpt-6-luna ",
      "gpt-4o-mini",
    ]);
    withModelEnv({ OPENAI_MODEL: " gpt-4.1-mini " }, () => {
      assert.deepEqual(getOpenAiModelCandidates(fallbacks), [
        "gpt-4.1-mini",
        "gpt-4o-mini",
        "gpt-6-luna",
      ]);
    });
  });

  test("deduplicates the default without omitting requested legacy fallbacks", () => {
    withModelEnv({}, () => {
      assert.deepEqual(getOpenAiModelCandidates(["gpt-6-luna", " gpt-4.1-mini ", "gpt-4o-mini"]), [
        "gpt-6-luna",
        "gpt-4.1-mini",
        "gpt-4o-mini",
      ]);
      assert.deepEqual(getOpenAiModelCandidates([]), ["gpt-6-luna"]);
    });
  });
});

describe("OpenAI request model options", () => {
  const lunaModels = ["gpt-6-luna", "gpt-6-luna-2026-09-23"];
  const otherModels = [
    "gpt-4.1-mini",
    "gpt-4o-mini",
    "gpt-5",
    "gpt-5.4",
    "gpt-6-sol",
    "gpt-6-astra",
    "gpt-6-astra-2026-09-23",
    "o3",
  ];
  const lunaLookalikes = [
    "gpt-6-lunar",
    "gpt-6-luna-preview",
    "gpt-6-luna-2026-9-23",
    "gpt-6-luna-2026-09",
    "gpt-6-luna-2026-09-23-preview",
    "ft:gpt-6-luna:custom",
    "GPT-6-LUNA",
    "",
  ];

  test("uses no reasoning and max_completion_tokens for Luna and dated snapshots", () => {
    for (const model of lunaModels) {
      assert.deepEqual(getChatModelOptions(model, 1600), {
        reasoning_effort: "none",
        max_completion_tokens: 1600,
      });
    }
  });

  test("omits an unspecified chat token limit for Luna", () => {
    for (const model of lunaModels) {
      assert.deepEqual(getChatModelOptions(model), { reasoning_effort: "none" });
    }
  });

  test("preserves legacy token options and omits reasoning for other models", () => {
    for (const model of otherModels) {
      assert.deepEqual(getChatModelOptions(model, 800), { max_tokens: 800 });
      assert.deepEqual(getChatModelOptions(model), {});
    }
  });

  test("does not apply Luna chat options to lookalike names", () => {
    for (const model of lunaLookalikes) {
      assert.deepEqual(getChatModelOptions(model, 800), { max_tokens: 800 });
      assert.deepEqual(getChatModelOptions(model), {});
    }
  });

  test("uses the Responses reasoning shape for Luna and dated snapshots", () => {
    for (const model of lunaModels) {
      assert.deepEqual(getResponsesModelOptions(model), { reasoning: { effort: "none" } });
    }
  });

  test("does not force Responses reasoning for other models or Luna lookalikes", () => {
    for (const model of [...otherModels, ...lunaLookalikes]) {
      assert.deepEqual(getResponsesModelOptions(model), {});
    }
  });
});
