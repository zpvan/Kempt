import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { listModels } from "./ai-client";
import { classifyAiError } from "./ai-client";
import { TRPCError } from "@trpc/server";

export function assertProviderUrl(provider: "kimi" | "minimax", value: string) {
  if (provider === "kimi") return;
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (local && process.env.NODE_ENV !== "production" && url.protocol === "http:") return;
  const hosts = ["api.minimax.cn", "api.minimax.io", "api.minimaxi.com"];
  if (url.protocol !== "https:" || !hosts.includes(url.hostname) || url.username || url.password) throw new Error("Unsupported provider URL");
}

export function assistantProvider(provider: "kimi" | "minimax", baseUrl: string, apiKey: string) {
  if (provider === "kimi") return createOpenAICompatible({ name: "kimi-gw", baseURL: process.env.KIMI_AGENTGW_BASE_URL!, apiKey: process.env.KIMI_AGENTGW_API_KEY!, includeUsage: true, supportsStructuredOutputs: true });
  return createOpenAICompatible({ name: provider, baseURL: baseUrl, apiKey });
}

export async function availableModels(provider: "kimi" | "minimax", baseUrl: string, apiKey: string) {
  if (provider === "kimi") {
    const result = await listModels();
    return { models: result.models.map((model) => ({ id: model.id, displayName: model.displayName })), defaultModelId: result.defaultModelId };
  }
  assertProviderUrl(provider, baseUrl);
  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw classifyAiError(error);
  }
  const text = await response.text();
  if (!response.ok) {
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text; }
    throw new TRPCError({ code: "BAD_REQUEST", message: `Could not read MiniMax models: ${typeof body === "string" ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)}` });
  }
  const body = JSON.parse(text) as { data?: Array<{ id?: string; display_name?: string }>; default_model_id?: string };
  const models = (body.data ?? []).map((model) => ({ id: String(model.id ?? ""), displayName: model.display_name })).filter((model) => model.id);
  const defaultModelId = body.default_model_id ?? models[0]?.id ?? "";
  if (!defaultModelId) throw new TRPCError({ code: "BAD_REQUEST", message: "No models are available for this MiniMax account" });
  return { models, defaultModelId };
}
