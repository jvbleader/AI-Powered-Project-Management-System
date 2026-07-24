"use client";

import React, { useState, useRef, useEffect } from "react";
import type { UserProfile } from "@/types";

interface AssigneeSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: UserProfile[];
  disabled?: boolean;
  title?: string;
  placeholder?: string;
  className?: string;
}

export function AssigneeSelect({
  value,
  onChange,
  options,
  disabled,
  title,
  placeholder = "-- Chưa phân công --",
  className = "task-detail-control task-detail-select",
}: AssigneeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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

  const selectedOption = options.find((o) => o.id === value);

  const filteredOptions = options.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.employeeCode && user.employeeCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
      user.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          padding: "8px 12px",
          background: disabled ? "var(--surface-sunken)" : "var(--surface)",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        disabled={disabled}
      >
        {selectedOption ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
            <span
              className="avatar-token"
              style={{
                width: 24,
                height: 24,
                fontSize: 10,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                borderRadius: "50%",
                background: selectedOption.avatarUrl ? "transparent" : "var(--accent)",
                color: "#ffffff",
              }}
            >
              {selectedOption.avatarUrl ? (
                <img src={selectedOption.avatarUrl} alt={selectedOption.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                selectedOption.initials
              )}
            </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selectedOption.name} - {selectedOption.employeeCode || (selectedOption.id.startsWith("usr-") ? selectedOption.id : `usr-${selectedOption.id}`)}
            </span>
          </div>
        ) : (
          <span style={{ color: "var(--foreground-muted)" }}>{placeholder}</span>
        )}
        <span style={{ color: "var(--foreground-muted)", fontSize: "0.8em" }}>▼</span>
      </button>

      {isOpen && !disabled && (
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
                outline: "none"
              }}
              onFocus={(e) => e.target.style.borderColor = "var(--primary)"}
              onBlur={(e) => e.target.style.borderColor = "var(--border)"}
            />
          </div>
          <li
            onClick={() => {
              onChange("");
              setIsOpen(false);
            }}
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
            filteredOptions.map((user) => (
              <li
              key={user.id}
              onClick={() => {
                onChange(user.id);
                setIsOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                cursor: "pointer",
                borderRadius: "4px",
                background: value === user.id ? "var(--surface-sunken)" : "transparent",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-sunken)")}
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = value === user.id ? "var(--surface-sunken)" : "transparent")
              }
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: user.avatarUrl ? "transparent" : "var(--accent)",
                  color: "#ffffff",
                  fontSize: "10px",
                  fontWeight: 600,
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  user.initials
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--ink)", lineHeight: 1.2 }}>
                  {user.name}
                </span>
                <span style={{ fontSize: "12px", color: "var(--foreground-muted)", marginTop: "2px" }}>
                  {user.employeeCode || (user.id.startsWith("usr-") ? user.id : `usr-${user.id}`)}
                </span>
              </div>
            </li>
          ))) : (
            <li style={{ padding: "8px 12px", color: "var(--foreground-muted)", textAlign: "center", fontSize: "0.875rem" }}>
              Không tìm thấy kết quả
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
