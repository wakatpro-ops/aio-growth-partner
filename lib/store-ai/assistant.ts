import "server-only";
import OpenAI from "openai";
import { getChatModelOptions, getOpenAiModel } from "@/lib/openai/models";
import { buildAssistantMessages, type AssistantInput } from "./prompt";
import type { AiContext } from "./context-rules";

export async function generateStoreAssistantAnswer(context: AiContext, input: AssistantInput) {
  if (!process.env.OPENAI_API_KEY) { console.warn("store_ai_reply_failed", { reason: "missing_api_key" }); throw new Error("assistant_unavailable"); }
  const model = getOpenAiModel();
  const response = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000, maxRetries: 0 }).chat.completions.create({
    model,
    ...getChatModelOptions(model, 1500),
    temperature: 0.2,
    messages: buildAssistantMessages(context, input)
  }).catch((error: unknown) => {
    // Operational diagnostics only: never log prompts, replies, credentials or customer data.
    console.warn("store_ai_reply_failed", { status: error instanceof OpenAI.APIError ? error.status : null, reason: error instanceof OpenAI.APIError ? "provider_error" : "transport_error" });
    throw new Error("assistant_unavailable");
  });
  const answer = response.choices[0]?.message?.content?.trim();
  if (!answer || response.choices[0]?.finish_reason === "length") { console.warn("store_ai_reply_failed", { reason: answer ? "output_limit" : "empty_reply" }); throw new Error("assistant_unavailable"); }
  return { answer, model: response.model };
}
