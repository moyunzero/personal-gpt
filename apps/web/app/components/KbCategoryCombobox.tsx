"use client";

import { useEffect, useId, useRef, useState } from "react";

type KbCategoryComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

/** 分类筛选/编辑：锚定在输入框下方的轻量 combobox，替代原生 datalist */
export default function KbCategoryCombobox({
  value,
  onChange,
  options,
  placeholder = "分类",
  className,
  "aria-label": ariaLabel,
  disabled,
  onKeyDown,
}: KbCategoryComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const query = value.trim().toLowerCase();
  const filtered = options.filter((opt) => !query || opt.toLowerCase().includes(query));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const selectOption = (opt: string) => {
    onChange(opt);
    setOpen(false);
    setHighlight(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && open && highlight >= 0 && filtered[highlight]) {
      e.preventDefault();
      selectOption(filtered[highlight]);
      return;
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlight(-1);
    }
    onKeyDown?.(e);
  };

  const showMenu = open && filtered.length > 0;

  return (
    <div className={`kb-combobox${className ? ` ${className}` : ""}`} ref={containerRef}>
      <div className="kb-combobox-control">
        <input
          ref={inputRef}
          className="kb-field-input kb-combobox-input"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setHighlight(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-expanded={showMenu ? "true" : "false"}
          aria-controls={showMenu ? listId : undefined}
          aria-autocomplete="list"
          role="combobox"
          disabled={disabled}
        />
        <button
          type="button"
          className="kb-combobox-chevron"
          tabIndex={-1}
          aria-label="展开分类列表"
          disabled={disabled}
          onClick={() => {
            setOpen((prev) => !prev);
            inputRef.current?.focus();
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M2.5 4.5 6 8l3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {value && !disabled ? (
          <button
            type="button"
            className="kb-combobox-clear"
            tabIndex={-1}
            aria-label="清除分类"
            onClick={() => {
              onChange("");
              setOpen(false);
              inputRef.current?.focus();
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path
                d="M3 3l6 6M9 3 3 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
      </div>
      {showMenu ? (
        <ul id={listId} className="kb-combobox-menu" role="listbox">
          {filtered.map((opt, i) => (
            <li
              key={opt}
              role="option"
              aria-selected={value === opt ? "true" : "false"}
              className={`kb-combobox-option${
                i === highlight ? " kb-combobox-option-active" : ""
              }${value === opt ? " kb-combobox-option-selected" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                selectOption(opt);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              {opt}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
