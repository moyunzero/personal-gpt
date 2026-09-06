"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  role: string;
  isActive: boolean;
};

type WorkspaceSwitcherProps = {
  /** sidebar：侧栏底部单 pill + 弹出菜单；default：完整表单 */
  variant?: "default" | "sidebar";
};

/** Multi-workspace switcher + team workspace create (D-40, D-42). */
export default function WorkspaceSwitcher({ variant = "default" }: WorkspaceSwitcherProps) {
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/workspace");
    const data = (await res.json()) as { workspaces?: WorkspaceRow[] };
    if (res.ok && data.workspaces) {
      setWorkspaces(data.workspaces);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Mount: load workspace list from API (external store).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch→setState
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setShowCreate(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const switchWorkspace = async (workspaceId: string) => {
    const current = workspaces.find((w) => w.isActive);
    if (workspaceId === current?.id) {
      setOpen(false);
      return;
    }
    const res = await fetch("/api/workspace/active", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });
    if (res.ok) {
      window.location.reload();
    }
  };

  const createTeam = async () => {
    if (!teamName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: teamName.trim() }),
      });
      if (res.ok) {
        setTeamName("");
        setShowCreate(false);
        await refresh();
        window.location.reload();
      }
    } finally {
      setCreating(false);
    }
  };

  const active = workspaces.find((w) => w.isActive);
  const initial = (active?.name?.trim()?.[0] || "W").toUpperCase();

  if (variant === "sidebar") {
    return (
      <div className="ws-sidebar" ref={rootRef}>
        {open ? (
          <div className="ws-menu" role="menu" aria-label="工作区菜单">
            <div className="ws-menu-label">切换工作区</div>
            <div className="ws-menu-list">
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={ws.isActive}
                  className={`ws-menu-item${ws.isActive ? " active" : ""}`}
                  onClick={() => void switchWorkspace(ws.id)}
                >
                  <span className="ws-menu-item-name">{ws.name}</span>
                  <span className="ws-menu-item-role">{ws.role}</span>
                </button>
              ))}
            </div>
            <div className="ws-menu-divider" />
            {showCreate ? (
              <div className="ws-menu-create">
                <input
                  className="ws-menu-input"
                  placeholder="团队名称"
                  value={teamName}
                  autoFocus
                  onChange={(e) => setTeamName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void createTeam();
                    if (e.key === "Escape") setShowCreate(false);
                  }}
                  aria-label="团队工作区名称"
                />
                <div className="ws-menu-create-actions">
                  <button
                    type="button"
                    className="ws-menu-link"
                    onClick={() => {
                      setShowCreate(false);
                      setTeamName("");
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="ws-menu-create-submit"
                    disabled={creating || !teamName.trim()}
                    onClick={() => void createTeam()}
                  >
                    创建
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="ws-menu-item ws-menu-create-trigger"
                onClick={() => setShowCreate(true)}
              >
                + 新建团队工作区
              </button>
            )}
          </div>
        ) : null}

        <button
          type="button"
          className="ws-pill"
          title="切换工作区"
          onClick={() => {
            setOpen((v) => !v);
            setShowCreate(false);
          }}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <span className="ws-avatar">{loading ? "…" : initial}</span>
          <span className="ws-meta">
            <span className="ws-name">{loading ? "加载中…" : (active?.name ?? "工作区")}</span>
            <span className="ws-role">{active?.role ?? ""}</span>
          </span>
          <svg
            className={`ws-chevron${open ? " open" : ""}`}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="workspace-switcher" aria-label="工作区">
      {loading ? (
        <span className="workspace-switcher-label">工作区…</span>
      ) : (
        <>
          <label className="workspace-switcher-label" htmlFor="workspace-select">
            工作区
          </label>
          <select
            id="workspace-select"
            className="kb-field-input workspace-switcher-select"
            value={active?.id ?? ""}
            onChange={(e) => void switchWorkspace(e.target.value)}
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name} ({ws.role})
              </option>
            ))}
          </select>
          <div className="workspace-switcher-create">
            <input
              className="kb-field-input"
              placeholder="新团队工作区名称"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              aria-label="团队工作区名称"
            />
            <button
              type="button"
              className="kb-btn kb-btn-ghost"
              disabled={creating || !teamName.trim()}
              onClick={() => void createTeam()}
            >
              创建
            </button>
          </div>
        </>
      )}
    </div>
  );
}
