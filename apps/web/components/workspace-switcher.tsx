"use client";

import { useCallback, useEffect, useState } from "react";

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  role: string;
  isActive: boolean;
};

/** Multi-workspace switcher + team workspace create (D-40, D-42). */
export default function WorkspaceSwitcher() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [teamName, setTeamName] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/workspace");
    const data = (await res.json()) as { workspaces?: WorkspaceRow[] };
    if (res.ok && data.workspaces) {
      setWorkspaces(data.workspaces);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const switchWorkspace = async (workspaceId: string) => {
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
        await refresh();
        window.location.reload();
      }
    } finally {
      setCreating(false);
    }
  };

  const active = workspaces.find((w) => w.isActive);

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
              className="kb-btn-secondary"
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
