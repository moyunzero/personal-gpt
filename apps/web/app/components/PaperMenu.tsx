"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type PaperMenuOption = {
  value: string;
  title: string;
  detail?: string;
};

type PaperMenuProps = {
  value: string;
  options: PaperMenuOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  variant?: "field" | "chip";
  placement?: "down" | "up";
  footer?: ReactNode;
};

const subscribers = new Set<(activeId: string | null) => void>();

function broadcast(activeId: string | null) {
  subscribers.forEach((notify) => notify(activeId));
}

export default function PaperMenu({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = "请选择",
  disabled,
  className,
  variant = "field",
  placement = "down",
  footer,
}: PaperMenuProps) {
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const chip = variant === "chip";

  useEffect(() => {
    const notify = (activeId: string | null) => setOpen(activeId === id);
    subscribers.add(notify);
    return () => {
      subscribers.delete(notify);
    };
  }, [id]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) broadcast(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      broadcast(null);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span
      ref={rootRef}
      className={[chip ? "model-chip-wrap" : "paper-menu", className].filter(Boolean).join(" ")}
    >
      <button
        ref={triggerRef}
        type="button"
        className={chip ? "model-chip" : selected ? "paper-menu-btn" : "paper-menu-btn is-empty"}
        disabled={disabled}
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => broadcast(open ? null : id)}
      >
        <span>{selected ? selected.title : placeholder}</span>
        {chip ? null : (
          <i className={open ? "paper-menu-caret open" : "paper-menu-caret"} aria-hidden="true" />
        )}
      </button>
      {open ? (
        <div
          className={
            chip ? "model-menu" : placement === "up" ? "paper-menu-list up" : "paper-menu-list"
          }
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "on" : undefined}
              onClick={() => {
                onChange(option.value);
                broadcast(null);
              }}
            >
              {option.title}
              {option.detail ? <small>{option.detail}</small> : null}
            </button>
          ))}
          {footer}
        </div>
      ) : null}
    </span>
  );
}
