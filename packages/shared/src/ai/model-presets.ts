/**
 * 设置页的平台和模型。默认选中带免费额度的最新模型。
 * baseURL 与模型 id 以各家公开文档为准。免费表示该平台有免费额度，不是不限额。
 */

export type ModelTier = "free" | "latest";

export type VendorModel = {
  modelId: string;
  label: string;
  tier: ModelTier;
};

export type ChatModelVendor = {
  id: string;
  label: string;
  baseURL: string;
  models: readonly VendorModel[];
};

/** 顺序按 2026-09 OpenRouter 七日 token：OpenAI、Google、Anthropic、Moonshot。xAI、Groq 不在该榜前十，接在后面。 */
export const CHAT_MODEL_VENDORS: readonly ChatModelVendor[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    models: [{ modelId: "gpt-6-astra", label: "GPT-6 Astra", tier: "latest" }],
  },
  {
    id: "google",
    label: "Google",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    models: [{ modelId: "gemini-3.8-flash", label: "Gemini 3.8 Flash", tier: "free" }],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseURL: "https://api.anthropic.com/v1/",
    models: [{ modelId: "claude-opus-5-5", label: "Claude Opus 5.5", tier: "latest" }],
  },
  {
    id: "kimi",
    label: "Kimi",
    baseURL: "https://api.moonshot.ai/v1",
    models: [{ modelId: "kimi-k3", label: "Kimi K3", tier: "latest" }],
  },
  {
    id: "xai",
    label: "xAI",
    baseURL: "https://api.x.ai/v1",
    models: [{ modelId: "grok-4.7", label: "Grok 4.7", tier: "latest" }],
  },
  {
    id: "groq",
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    models: [{ modelId: "openai/gpt-oss-120b", label: "GPT-OSS 120B", tier: "free" }],
  },
];

export const DEFAULT_VENDOR_ID = "groq";
export const DEFAULT_CHAT_MODEL_ID = "openai/gpt-oss-120b";

const models = CHAT_MODEL_VENDORS.flatMap((vendor) =>
  vendor.models.map((model) => ({ ...model, vendor: vendor.label, baseURL: vendor.baseURL })),
);

const byModelId = new Map(models.map((item) => [item.modelId, item]));
const vendorUrls = new Set(CHAT_MODEL_VENDORS.map((vendor) => vendor.baseURL));

export function vendorById(id: string): ChatModelVendor | undefined {
  return CHAT_MODEL_VENDORS.find((vendor) => vendor.id === id);
}

export function presetForModel(modelId: string): { baseURL: string } | undefined {
  const found = byModelId.get(modelId);
  return found ? { baseURL: found.baseURL } : undefined;
}

export function modelLabel(modelId: string): string {
  return byModelId.get(modelId)?.label ?? modelId;
}

export function modelTier(modelId: string): ModelTier | undefined {
  return byModelId.get(modelId)?.tier;
}

export function isKnownProviderBaseURL(baseURL: string): boolean {
  return vendorUrls.has(baseURL);
}

/** null when the id is in the provider list. */
export function unknownModelMessage(modelId: string, ids: readonly string[]): string | null {
  if (ids.includes(modelId)) return null;
  return `这个平台没有「${modelId}」。请改用列表里的模型，或核对模型 id`;
}
