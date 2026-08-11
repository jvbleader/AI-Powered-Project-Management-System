"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type FilterOption = {
  value: string;
  label: string;
};

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  placeholder?: string;
  className?: string;
  onEditClick?: (value: string) => void;
  /** Enable type-to-search inside the dropdown */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Larger trigger for denser dashboard headers */
  size?: "default" | "lg";
  disabled?: boolean;
}

export function FilterSelect({
  value,
  onChange,
  options,
  placeholder = "-- Chọn trạng thái --",
  className = "",
  onEditClick,
  searchable = false,
  searchPlaceholder = "Tìm kiếm...",
  size = "default",
  disabled = false,
}: FilterSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchable) {
      const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen, searchable]);

  const selectedOption = options.find((o) => o.value === value);

  const filteredOptions = useMemo(() => {
    if (!searchable || !searchQuery.trim()) return options;
    const q = searchQuery.trim().toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q),
    );
  }, [options, searchable, searchQuery]);

  const isLarge = size === "lg";

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        minWidth: isLarge ? "260px" : "180px",
        width: "100%",
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setIsOpen((open) => !open);
          if (isOpen) setSearchQuery("");
        }}
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          textAlign: "left",
          width: "100%",
          minHeight: isLarge ? "46px" : undefined,
          padding: isLarge ? "0.85rem 1.35rem" : "0.6rem 1.25rem",
          borderRadius: "9999px",
          border: isOpen ? "1px solid var(--primary)" : "1px solid var(--border)",
          background: disabled ? "rgba(248, 250, 252, 0.9)" : "#ffffff",
          color: "var(--foreground)",
          fontSize: isLarge ? "0.95rem" : "0.875rem",
          fontWeight: 500,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.7 : 1,
          outline: "none",
          transition: "border-color 0.2s ease, box-shadow 0.2s ease",
          boxShadow: isOpen ? "0 0 0 2px rgba(var(--primary-rgb), 0.2)" : "none",
          gap: "0.75rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            minWidth: 0,
            flex: 1,
          }}
        >
          {onEditClick && value && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onEditClick(value);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--accent)",
                padding: "2px",
                flexShrink: 0,
              }}
              title="Xem chi tiết"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </div>
          )}
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <span
          style={{
            color: "var(--foreground-muted)",
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          {searchable ? (
            <svg
              width={isLarge ? 18 : 16}
              height={isLarge ? 18 : 16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          ) : (
            <svg
              width={isLarge ? 18 : 16}
              height={isLarge ? 18 : 16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          )}
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 100,
            background: "#ffffff",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            marginTop: "6px",
            padding: "6px",
            boxShadow: "0 8px 20px rgba(15, 23, 42, 0.12)",
            minWidth: isLarge ? "280px" : undefined,
          }}
        >
          {searchable ? (
            <div style={{ padding: "4px 4px 8px" }}>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: isLarge ? "0.7rem 0.85rem" : "0.55rem 0.75rem",
                  borderRadius: "10px",
                  border: "1px solid rgba(148,163,184,0.35)",
                  fontSize: isLarge ? "0.92rem" : "0.85rem",
                  outline: "none",
                  background: "rgba(248,250,252,0.95)",
                }}
              />
            </div>
          ) : null}

          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              maxHeight: isLarge ? "280px" : "250px",
              overflowY: "auto",
            }}
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <li
                  key={opt.value || "__all__"}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                    setSearchQuery("");
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: isLarge ? "10px 12px" : "8px 12px",
                    cursor: "pointer",
                    borderRadius: "8px",
                    fontSize: isLarge ? "0.92rem" : "0.875rem",
                    fontWeight: value === opt.value ? 600 : 400,
                    color: value === opt.value ? "var(--primary)" : "var(--foreground)",
                    background: value === opt.value ? "var(--surface-sunken)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (value !== opt.value) {
                      e.currentTarget.style.background = "var(--surface-sunken)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (value !== opt.value) {
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  {value === opt.value && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  )}
                  <span style={{ marginLeft: value === opt.value ? 0 : "22px" }}>
                    {opt.label}
                  </span>
                </li>
              ))
            ) : (
              <li
                style={{
                  padding: "12px",
                  fontSize: "0.85rem",
                  color: "var(--foreground-muted)",
                  textAlign: "center",
                }}
              >
                Không tìm thấy dự án
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
