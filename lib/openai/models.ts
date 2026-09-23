import type OpenAI from "openai";

export const DEFAULT_OPENAI_MODEL = "gpt-6-luna";

export function getOpenAiModel() {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

export function getOpenAiSearchModel() {
  return process.env.OPENAI_SEARCH_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

export function getOpenAiModelCandidates(fallbackModels: readonly string[]) {
  return Array.from(new Set([getOpenAiModel(), ...fallbackModels.map((model) => model.trim()).filter(Boolean)]));
}

function isGpt6Luna(model: string) {
  return /^gpt-6-luna(?:-\d{4}-\d{2}-\d{2})?$/u.test(model);
}

type ChatModelOptions = Pick<
  OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  "reasoning_effort" | "max_completion_tokens" | "max_tokens"
>;

// Preserve the non-reasoning behavior of the previous GPT-4 workloads.
// https://developers.openai.com/api/docs/guides/latest-model/gpt-6-astra.md
export function getChatModelOptions(model: string, maxTokens?: number): ChatModelOptions {
  if (isGpt6Luna(model)) {
    return {
      // OpenAI SDK v4 predates the API's supported "none" enum value.
      reasoning_effort: "none" as NonNullable<ChatModelOptions["reasoning_effort"]>,
      ...(maxTokens === undefined ? {} : { max_completion_tokens: maxTokens })
    };
  }
  return maxTokens === undefined ? {} : { max_tokens: maxTokens };
}

type ResponsesModelOptions = Pick<OpenAI.Responses.ResponseCreateParamsNonStreaming, "reasoning">;

export function getResponsesModelOptions(model: string): ResponsesModelOptions {
  if (!isGpt6Luna(model)) return {};
  return {
    reasoning: {
      // Keep the compatibility cast local until the SDK gains "none".
      effort: "none" as NonNullable<NonNullable<ResponsesModelOptions["reasoning"]>["effort"]>
    }
  };
}
