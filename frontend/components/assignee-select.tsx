"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatEmployeeCode } from "@/lib/utils/format";
import { UserAvatar } from "@/components/user-avatar";
import type { UserProfile } from "@/types";

interface AssigneeSelectProps {
  value: string | string[];
  onChange: (value: string[]) => void;
  options: UserProfile[];
  disabled?: boolean;
  title?: string;
  placeholder?: string;
  className?: string;
  dropdownPlacement?: "top" | "bottom";
}

function normalizeIds(value: string | string[] | undefined | null) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  return value ? [value] : [];
}

export function AssigneeSelect({
  value,
  onChange,
  options,
  disabled,
  title,
  placeholder = "-- Chưa phân công --",
  className = "task-detail-control",
  dropdownPlacement = "bottom",
}: AssigneeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selectedIds = useMemo(() => normalizeIds(value), [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const selectedOptions = options.filter((user) => selectedIds.includes(user.id));
  const filteredOptions = options.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.employeeCode && user.employeeCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
      user.id.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  function toggleUser(userId: string) {
    if (selectedIds.includes(userId)) {
      onChange(selectedIds.filter((id) => id !== userId));
      return;
    }
    onChange([...selectedIds, userId]);
  }

  const placementStyles: React.CSSProperties =
    dropdownPlacement === "top"
      ? { bottom: "100%", top: "auto", marginBottom: "4px" }
      : { top: "100%", bottom: "auto", marginTop: "4px" };

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }} title={title}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          textAlign: "left",
          width: "100%",
          overflow: "hidden",
          cursor: disabled ? "not-allowed" : "pointer",
          gap: "8px",
        }}
        disabled={disabled}
      >
        <div
          className="assignee-select-scroll-container"
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            flexWrap: "nowrap",
            gap: "4px",
            overflowX: "auto",
            overflowY: "hidden",
            padding: "2px 0",
            WebkitOverflowScrolling: "touch",
          }}
          onWheel={(e) => {
            if (e.currentTarget.scrollWidth > e.currentTarget.clientWidth) {
              if (e.deltaY !== 0) {
                e.stopPropagation();
                e.currentTarget.scrollLeft += e.deltaY;
              }
            }
          }}
        >
          {selectedOptions.length ? (
            selectedOptions.map((user) => (
              <span
                key={user.id}
                title={user.name}
                onMouseEnter={() => setHoveredId(user.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "999px",
                  flexShrink: 0,
                }}
              >
                <UserAvatar
                  userId={user.id}
                  email={user.email}
                  name={user.name}
                  avatarUrl={user.avatarUrl}
                  size={22}
                  style={{ flexShrink: 0 }}
                />
                {hoveredId === user.id ? (
                  <span
                    style={{
                      position: "absolute",
                      bottom: "calc(100% + 8px)",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "#0f172a",
                      color: "#fff",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      lineHeight: 1.2,
                      padding: "6px 8px",
                      borderRadius: 8,
                      whiteSpace: "nowrap",
                      zIndex: 30,
                      pointerEvents: "none",
                      boxShadow: "0 8px 20px rgba(15, 23, 42, 0.18)",
                    }}
                  >
                    {user.name}
                  </span>
                ) : null}
              </span>
            ))
          ) : (
            <span style={{ color: "var(--foreground-muted)", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {placeholder}
            </span>
          )}
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, color: "var(--foreground-muted)" }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen && !disabled && (
        <ul
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            zIndex: 100,
            background: "#ffffff",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            padding: "4px",
            listStyle: "none",
            maxHeight: "280px",
            overflowY: "auto",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            ...placementStyles,
          }}
        >
          <div style={{ padding: "4px 8px", position: "sticky", top: 0, background: "#fff", zIndex: 1, marginBottom: "4px" }}>
            <input
              type="text"
              placeholder="Tìm kiếm..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                padding: "6px 8px",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                fontSize: "0.875rem",
                outline: "none",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--primary)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
            />
          </div>
          <li
            onClick={() => onChange([])}
            style={{
              padding: "8px 12px",
              cursor: "pointer",
              borderRadius: "4px",
              color: "var(--foreground-muted)",
              marginBottom: "4px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-sunken)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {placeholder}
          </li>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((user) => {
              const checked = selectedIds.includes(user.id);
              return (
                <li
                  key={user.id}
                  onClick={() => toggleUser(user.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 12px",
                    cursor: "pointer",
                    borderRadius: "4px",
                    background: checked ? "var(--surface-sunken)" : "transparent",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-sunken)")}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = checked ? "var(--surface-sunken)" : "transparent")
                  }
                >
                  <span
                    aria-hidden
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      border: checked ? "0" : "1.5px solid rgba(15, 23, 42, 0.28)",
                      background: checked ? "var(--accent)" : "#fff",
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {checked ? "✓" : ""}
                  </span>
                  <UserAvatar
                    userId={user.id}
                    email={user.email}
                    name={user.name}
                    avatarUrl={user.avatarUrl}
                    size={28}
                    style={{ flexShrink: 0 }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--ink)", lineHeight: 1.2 }}>
                      {user.name}
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--foreground-muted)", marginTop: "2px" }}>
                      {user.employeeCode || formatEmployeeCode(user.id)}
                    </span>
                  </div>
                </li>
              );
            })
          ) : (
            <li style={{ padding: "8px 12px", color: "var(--foreground-muted)", textAlign: "center", fontSize: "0.875rem" }}>
              Không tìm thấy kết quả
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
