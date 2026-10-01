"use client";

import { useEffect, useState } from "react";

export type WorkspaceMemberOption = {
  userId: string;
  email: string | null;
  name: string | null;
};

type RestrictedMemberPickerProps = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

/** Multi-select workspace members for restricted visibility allowlists. */
export default function RestrictedMemberPicker({
  selectedIds,
  onChange,
  disabled,
}: RestrictedMemberPickerProps) {
  const [members, setMembers] = useState<WorkspaceMemberOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/workspace/members");
        const data = (await res.json()) as { members?: WorkspaceMemberOption[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "无法加载成员列表");
        if (!cancelled) {
          setMembers(data.members ?? []);
          setLoadError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "无法加载成员列表");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return <p className="kb-field-hint kb-field-hint-error">{loadError}</p>;
  }

  if (members.length === 0) {
    return <p className="kb-field-hint">暂无其他成员可选</p>;
  }

  return (
    <fieldset className="kb-restricted-members" disabled={disabled}>
      <legend className="kb-field-label">可访问成员</legend>
      <ul className="kb-restricted-member-list">
        {members.map((member) => {
          const checked = selectedIds.includes(member.userId);
          const label = member.name?.trim() || member.email?.trim() || member.userId.slice(0, 8);
          return (
            <li key={member.userId}>
              <label className="kb-restricted-member-row">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    onChange(
                      checked
                        ? selectedIds.filter((id) => id !== member.userId)
                        : [...selectedIds, member.userId],
                    );
                  }}
                />
                <span>{label}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {selectedIds.length === 0 ? (
        <p className="kb-field-hint kb-field-hint-error">请至少选择一名成员</p>
      ) : null}
    </fieldset>
  );
}
