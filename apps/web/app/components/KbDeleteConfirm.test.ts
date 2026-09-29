import { describe, expect, it, vi } from "vitest";

import {
  focusKbDeleteDialog,
  kbDeleteConfirmHandlesEscape,
} from "./KbDeleteConfirm";

describe("KbDeleteConfirm a11y helpers (D-20②)", () => {
  it("Escape key should cancel", () => {
    expect(kbDeleteConfirmHandlesEscape("Escape")).toBe(true);
    expect(kbDeleteConfirmHandlesEscape("Enter")).toBe(false);
    expect(kbDeleteConfirmHandlesEscape("Tab")).toBe(false);
  });

  it("focusKbDeleteDialog focuses the dialog element on open", () => {
    const focus = vi.fn();
    focusKbDeleteDialog({ focus } as unknown as HTMLElement);
    expect(focus).toHaveBeenCalledOnce();

    expect(() => focusKbDeleteDialog(null)).not.toThrow();
  });
});
