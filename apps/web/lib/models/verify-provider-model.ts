import { unknownModelMessage } from "@personal-gpt/shared/ai/model-presets";

function modelsUrl(baseURL: string): string {
  return new URL("models", baseURL.endsWith("/") ? baseURL : `${baseURL}/`).toString();
}

/** Anthropic rejects Bearer on /v1/models. Its list call needs x-api-key and anthropic-version. */
function providerHeaders(baseURL: string, apiKey: string): HeadersInit {
  let host = "";
  try {
    host = new URL(baseURL).hostname;
  } catch {
    host = "";
  }
  if (host === "api.anthropic.com") {
    return {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
  }
  return { Authorization: `Bearer ${apiKey}` };
}

/** Lists model ids. Throws when the key is rejected. Returns null when the list cannot be read. */
export async function listProviderModelIds(baseURL: string, apiKey: string): Promise<string[] | null> {
  let response: Response;
  try {
    response = await fetch(modelsUrl(baseURL), {
      headers: providerHeaders(baseURL, apiKey),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error("无法连接该平台");
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error("API key 无法通过这个平台的校验");
  }
  if (!response.ok) return null;
  const body = (await response.json()) as { data?: { id?: unknown }[] };
  if (!Array.isArray(body.data)) return null;
  return body.data
    .map((item) => (typeof item.id === "string" ? item.id : ""))
    .filter(Boolean);
}

export async function assertProviderModel(params: {
  baseURL: string;
  apiKey: string;
  modelId: string;
}): Promise<void> {
  const ids = await listProviderModelIds(params.baseURL, params.apiKey);
  if (!ids) throw new Error("暂时读不到该平台的模型列表，请稍后再试");
  const message = unknownModelMessage(params.modelId, ids);
  if (message) throw new Error(message);
}
