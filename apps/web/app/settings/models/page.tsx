"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  CHAT_MODEL_VENDORS,
  DEFAULT_CHAT_MODEL_ID,
  DEFAULT_VENDOR_ID,
  modelLabel,
  modelTier,
  vendorById,
} from "@personal-gpt/shared/ai/model-presets";

import AppShell from "../../components/AppShell";
import PaperMenu from "../../components/PaperMenu";

type ModelRow = { id: string; modelId: string };

function tierText(modelId: string): string {
  const tier = modelTier(modelId);
  if (tier === "free") return "免费额度";
  if (tier === "latest") return "当前旗舰";
  return "自定义";
}

export default function ModelsSettingsPage() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [chatModelId, setChatModelId] = useState("");
  const [agentModelId, setAgentModelId] = useState("");
  const [vendorId, setVendorId] = useState(DEFAULT_VENDOR_ID);
  const [modelId, setModelId] = useState(DEFAULT_CHAT_MODEL_ID);
  const [custom, setCustom] = useState(false);
  const [customId, setCustomId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const vendor = vendorById(vendorId) ?? CHAT_MODEL_VENDORS[0];

  const savedOptions = models.map((model) => ({
    value: model.modelId,
    title: modelLabel(model.modelId),
    detail: tierText(model.modelId),
  }));

  async function loadModels() {
    const res = await fetch("/api/models");
    if (!res.ok) return null;
    return (await res.json()) as {
      models: ModelRow[];
      chatModelId: string;
      agentModelId: string;
    };
  }

  function applyModels(data: { models: ModelRow[]; chatModelId: string; agentModelId: string }) {
    setModels(data.models);
    setChatModelId(data.chatModelId);
    setAgentModelId(data.agentModelId);
  }

  useEffect(() => {
    let cancelled = false;
    void loadModels().then((data) => {
      if (!data || cancelled) return;
      applyModels(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function chooseVendor(next: string) {
    const found = vendorById(next);
    setVendorId(next);
    setCustom(false);
    setModelId(found?.models[0]?.modelId ?? "");
    setError("");
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    setError("");
    const res = await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendorId,
        modelId: custom ? customId : modelId,
        apiKey,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "添加失败");
      return;
    }
    setApiKey("");
    setCustomId("");
    const loaded = await loadModels();
    if (loaded) applyModels(loaded);
  }

  async function select(kind: "chat" | "agent", next: string) {
    const res = await fetch("/api/models", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kind === "chat" ? { chatModelId: next } : { agentModelId: next }),
    });
    if (!res.ok) return;
    if (kind === "chat") setChatModelId(next);
    else setAgentModelId(next);
  }

  return (
    <AppShell activePage="settings">
      <section className="settings-models">
        <p className="settings-kicker">设置</p>
        <h1 className="settings-title">模型供应商</h1>
        <p className="settings-lead">
          先选平台，再选该平台当前的模型。Groq 和 Google
          带免费额度，其余按各家计费。自定义名称会先向平台核对，对不上就不会保存。
        </p>
        <div className="settings-card">
          {models.length > 0 ? (
            <>
              <label className="settings-row">
                <span>对话模型</span>
                <PaperMenu
                  value={chatModelId}
                  placeholder="选择已添加的模型"
                  options={savedOptions}
                  ariaLabel="对话模型"
                  onChange={(next) => void select("chat", next)}
                />
              </label>
              <label className="settings-row">
                <span>Agent 模型</span>
                <PaperMenu
                  value={agentModelId}
                  placeholder="选择已添加的模型"
                  options={savedOptions}
                  ariaLabel="Agent 模型"
                  onChange={(next) => void select("agent", next)}
                />
              </label>
              <ul className="settings-saved">
                {models.map((model) => (
                  <li key={model.id}>
                    <strong>{modelLabel(model.modelId)}</strong>
                    <span>{tierText(model.modelId)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="settings-empty">默认先用带免费额度的模型。填入该平台的 API key。</p>
          )}
          <form className="settings-form" onSubmit={(event) => void onAdd(event)}>
            <p className="settings-label">平台</p>
            <div className="settings-vendors">
              {CHAT_MODEL_VENDORS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === vendor.id ? "on" : undefined}
                  onClick={() => chooseVendor(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="settings-label">模型</p>
            <div className="settings-choices">
              {vendor.models.map((model) => (
                <button
                  key={model.modelId}
                  type="button"
                  className={!custom && model.modelId === modelId ? "on" : undefined}
                  onClick={() => {
                    setCustom(false);
                    setModelId(model.modelId);
                  }}
                >
                  <strong>{model.label}</strong>
                  <small>{model.tier === "free" ? "免费额度" : "当前旗舰"}</small>
                </button>
              ))}
              <button
                type="button"
                className={custom ? "on" : undefined}
                onClick={() => setCustom(true)}
              >
                <strong>自定义模型</strong>
                <small>填写该平台的模型 id</small>
              </button>
            </div>
            {custom ? (
              <input
                value={customId}
                onChange={(event) => setCustomId(event.target.value)}
                placeholder="模型 id，例如 gpt-6-sol"
                aria-label="自定义模型名称"
                required
              />
            ) : null}
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="该平台的 API key"
              aria-label="API key"
              type="password"
              autoComplete="off"
              required
            />
            <button type="submit">校验并添加</button>
          </form>
          {error ? <p className="settings-error">{error}</p> : null}
        </div>
      </section>
    </AppShell>
  );
}
