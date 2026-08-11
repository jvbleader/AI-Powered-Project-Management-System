"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  style?: React.CSSProperties;
  className?: string;
  disabled?: boolean;
  testId?: string;
}

interface MenuPosition {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

const MENU_GAP = 4;
const MENU_MAX_HEIGHT = 250;
const VIEWPORT_MARGIN = 8;
const MIN_SPACE_BEFORE_FLIPPING = 160;

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Chọn...",
  style,
  className,
  disabled,
  testId,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPosition = useCallback(() => {
    if (!containerRef.current) return;

    const triggerRect = containerRef.current.getBoundingClientRect();
    const availableBelow = window.innerHeight - triggerRect.bottom - MENU_GAP - VIEWPORT_MARGIN;
    const availableAbove = triggerRect.top - MENU_GAP - VIEWPORT_MARGIN;
    const openAbove = availableBelow < MIN_SPACE_BEFORE_FLIPPING && availableAbove > availableBelow;
    const availableHeight = Math.max(0, openAbove ? availableAbove : availableBelow);
    const width = Math.min(triggerRect.width, Math.max(0, window.innerWidth - VIEWPORT_MARGIN * 2));
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, triggerRect.left),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
    );

    setMenuPosition({
      left,
      width,
      maxHeight: Math.min(MENU_MAX_HEIGHT, availableHeight),
      ...(openAbove
        ? { bottom: window.innerHeight - triggerRect.top + MENU_GAP }
        : { top: triggerRect.bottom + MENU_GAP }),
    });
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <div
        className={`custom-select-default ${className || ""}`}
        data-testid={testId}
        role="combobox"
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-disabled={disabled}
        data-disabled={disabled}
        data-has-value={!!selectedOption}
        onClick={() => {
          if (disabled) return;
          if (!isOpen) updateMenuPosition();
          setIsOpen((currentlyOpen) => !currentlyOpen);
        }}
        style={style}
      >
        <span>{selectedOption ? selectedOption.label : placeholder}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transition: "transform 0.2s",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      {isOpen &&
        menuPosition &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="listbox"
            data-testid={testId ? `${testId}-menu` : undefined}
            style={{
              position: "fixed",
              left: menuPosition.left,
              width: menuPosition.width,
              top: menuPosition.top,
              bottom: menuPosition.bottom,
              background: "white",
              border: "1px solid var(--border-subtle)",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              zIndex: 10000,
              maxHeight: menuPosition.maxHeight,
              overflowY: "auto",
              padding: "4px",
            }}
          >
            {options.map((opt) => (
              <div
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                style={{
                  padding: "8px 12px",
                  cursor: "pointer",
                  borderRadius: "4px",
                  fontSize: "0.9rem",
                  color: opt.value === value ? "var(--accent)" : "var(--ink)",
                  background: opt.value === value ? "var(--accent-soft)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
                onMouseEnter={(e) => {
                  if (opt.value !== value)
                    e.currentTarget.style.background = "var(--surface-muted)";
                }}
                onMouseLeave={(e) => {
                  if (opt.value !== value) e.currentTarget.style.background = "transparent";
                }}
              >
                {opt.label}
                {opt.value === value && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                )}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
