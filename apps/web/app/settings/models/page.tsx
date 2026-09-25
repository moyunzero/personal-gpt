"use client";

import { FormEvent, useEffect, useState } from "react";

import AppShell from "../../components/AppShell";

type ModelRow = { id: string; modelId: string };

export default function ModelsSettingsPage() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [chatModelId, setChatModelId] = useState("");
  const [agentModelId, setAgentModelId] = useState("");
  const [modelId, setModelId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");

  async function reload() {
    const res = await fetch("/api/models");
    if (!res.ok) return;
    const data = (await res.json()) as {
      models: ModelRow[];
      chatModelId: string;
      agentModelId: string;
    };
    setModels(data.models);
    setChatModelId(data.chatModelId);
    setAgentModelId(data.agentModelId);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    setError("");
    const res = await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId, apiKey }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "添加失败");
      return;
    }
    setModelId("");
    setApiKey("");
    await reload();
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
          在这里添加模型名称和 API key。对话页只切换已经添加的模型，不再填写密钥。Chat 和 Agent
          可以各自指定，向量模型不在此列。
        </p>
        <div className="settings-card">
          <label className="settings-row">
            <span>对话模型</span>
            <select value={chatModelId} onChange={(event) => void select("chat", event.target.value)}>
              <option value="">未选择</option>
              {models.map((model) => (
                <option key={model.id} value={model.modelId}>
                  {model.modelId}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-row">
            <span>Agent 模型</span>
            <select
              value={agentModelId}
              onChange={(event) => void select("agent", event.target.value)}
            >
              <option value="">未选择</option>
              {models.map((model) => (
                <option key={model.id} value={model.modelId}>
                  {model.modelId}
                </option>
              ))}
            </select>
          </label>
          <ul className="settings-list">
            {models.map((model) => (
              <li key={model.id}>{model.modelId}</li>
            ))}
          </ul>
          <form className="settings-add" onSubmit={(event) => void onAdd(event)}>
            <input
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
              placeholder="模型名称，例如 openai/gpt-4o-mini"
              aria-label="模型名称"
              required
            />
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="API key"
              aria-label="API key"
              type="password"
              required
            />
            <button type="submit">添加模型</button>
          </form>
          {error ? <p className="settings-error">{error}</p> : null}
        </div>
      </section>
    </AppShell>
  );
}
