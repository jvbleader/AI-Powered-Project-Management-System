"use client";

import React, { useState, useRef, useEffect } from "react";

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
}

export function FilterSelect({
  value,
  onChange,
  options,
  placeholder = "-- Chọn trạng thái --",
  className = "",
}: FilterSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((o) => o.value === value);

  return (
    <div ref={ref} style={{ position: "relative", minWidth: "180px", width: "100%" }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          textAlign: "left",
          width: "100%",
          padding: "0.6rem 1.25rem",
          borderRadius: "9999px",
          border: isOpen ? "1px solid var(--primary)" : "1px solid var(--border)",
          background: "#ffffff",
          color: "var(--foreground)",
          fontSize: "0.875rem",
          fontWeight: 500,
          cursor: "pointer",
          outline: "none",
          transition: "border-color 0.2s ease, box-shadow 0.2s ease",
          boxShadow: isOpen ? "0 0 0 2px rgba(var(--primary-rgb), 0.2)" : "none",
        }}
      >
        <span>{selectedOption ? selectedOption.label : placeholder}</span>
        <span style={{ color: "var(--foreground-muted)", display: "flex", alignItems: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </span>
      </button>

      {isOpen && (
        <ul
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 100,
            background: "#ffffff",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            marginTop: "4px",
            padding: "4px",
            listStyle: "none",
            maxHeight: "250px",
            overflowY: "auto",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          }}
        >
          {options.map((opt) => (
            <li
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                cursor: "pointer",
                borderRadius: "4px",
                fontSize: "0.875rem",
                fontWeight: value === opt.value ? 600 : 400,
                color: value === opt.value ? "var(--primary)" : "var(--foreground)",
                background: value === opt.value ? "var(--surface-sunken)" : "transparent",
              }}
              onMouseEnter={(e) => {
                if (value !== opt.value) e.currentTarget.style.background = "var(--surface-sunken)";
              }}
              onMouseLeave={(e) => {
                if (value !== opt.value) e.currentTarget.style.background = "transparent";
              }}
            >
              {value === opt.value && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              )}
              <span style={{ marginLeft: value === opt.value ? 0 : "22px" }}>{opt.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
