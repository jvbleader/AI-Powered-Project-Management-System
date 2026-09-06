"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { UserAvatar } from "@/components/user-avatar";
import { toVietnamDateInputValue } from "@/lib/utils/format";
import styles from "../styles/gantt.module.css";

export type FilterPerson = {
  name: string;
  employeeCode?: string | null;
  userId?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};

export type FilterOption = {
  value: string;
  label: string;
  person?: FilterPerson | null;
};

const PERSON_AVATAR_SIZE = 22;

function personInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function GanttPersonCell({ person }: { person?: FilterPerson | null }) {
  const name = person?.name?.trim() || "Chưa giao";
  const code = person?.employeeCode?.trim() || "";
  const hasPhoto = Boolean(person?.avatarUrl);

  return (
    <span className={styles.ganttPerson}>
      {hasPhoto && person ? (
        <UserAvatar
          userId={person.userId}
          email={person.email}
          name={person.name}
          avatarUrl={person.avatarUrl}
          size={PERSON_AVATAR_SIZE}
          className={styles.ganttPersonAvatar}
        />
      ) : (
        <span className={`${styles.ganttPersonAvatar} ${styles.ganttPersonAvatarFallback}`} aria-hidden>
          {person ? personInitials(name) : "?"}
        </span>
      )}
      <span className={styles.ganttPersonCopy}>
        <span className={styles.ganttPersonName}>{name}</span>
        {code ? <span className={styles.ganttPersonCode}>{code}</span> : null}
      </span>
    </span>
  );
}

type OpenKey = string | null;

function toggleValue(current: string[], value: string) {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

function FilterIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function useFixedMenu(open: boolean, anchorRef: RefObject<HTMLElement | null>, minWidth = 260) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPos(null);
      return;
    }

    function update() {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.max(rect.width, minWidth);
      let left = rect.right - width;
      if (left < 8) left = 8;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8);
      }
      setPos({ top: rect.bottom + 6, left, width });
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef, minWidth]);

  return pos;
}

const TEXT_FILTER_DEBOUNCE_MS = 250;

function swallowBackdropEvent(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

function FilterPanel({
  open,
  onClose,
  anchorRef,
  minWidth,
  title,
  onClear,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  minWidth?: number;
  title: string;
  onClear: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const pos = useFixedMenu(open, anchorRef, minWidth);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || !pos || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <>
      <div
        className={styles.colFilterBackdrop}
        aria-hidden
        onPointerDown={swallowBackdropEvent}
        onMouseDown={swallowBackdropEvent}
        onMouseUp={swallowBackdropEvent}
        onClick={(event) => {
          swallowBackdropEvent(event);
          onClose();
        }}
      />
      <div
        ref={panelRef}
        className={styles.colFilterPanel}
        style={{ top: pos.top, left: pos.left, width: pos.width }}
        role="dialog"
        aria-label={title}
      >
        <div className={styles.colFilterHead}>
          <strong>{title}</strong>
        </div>
        <div className={styles.colFilterBody}>{children}</div>
        <div className={styles.colFilterActions}>
          <button type="button" className={styles.colFilterGhostBtn} onClick={onClear}>
            Xóa
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

function FilterIconButton({
  label,
  active,
  open,
  count,
  icon = "filter",
  buttonRef,
  onToggle,
}: {
  label: string;
  active: boolean;
  open: boolean;
  count?: number;
  icon?: "filter" | "search";
  buttonRef: RefObject<HTMLButtonElement | null>;
  onToggle: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`${styles.colFilterIconBtn} ${active ? styles.colFilterIconBtnActive : ""} ${open ? styles.colFilterIconBtnOpen : ""}`}
      aria-label={label}
      aria-expanded={open}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {icon === "search" ? <SearchIcon /> : <FilterIcon />}
      {active ? (
        <span className={styles.colFilterDot}>{count && count > 1 ? count : null}</span>
      ) : null}
    </button>
  );
}

export function HeaderTextFilter({
  filterKey,
  openKey,
  onOpenKeyChange,
  title,
  label,
  value,
  onChange,
  placeholder,
  icon = "filter",
}: {
  filterKey: string;
  openKey: OpenKey;
  onOpenKeyChange: (key: OpenKey) => void;
  title: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  icon?: "filter" | "search";
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = openKey === filterKey;
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (open) setDraft(value);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      const next = draft.trim();
      if (next !== value) onChange(next);
    }, TEXT_FILTER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, open, onChange, value]);

  const close = (flush = true) => {
    if (flush) onChange(draftRef.current.trim());
    onOpenKeyChange(null);
  };

  return (
    <>
      <FilterIconButton
        label={label}
        active={value.trim().length > 0}
        open={open}
        icon={icon}
        buttonRef={buttonRef}
        onToggle={() => (open ? close(true) : onOpenKeyChange(filterKey))}
      />
      <FilterPanel
        open={open}
        onClose={() => close(true)}
        anchorRef={buttonRef}
        title={title}
        onClear={() => {
          setDraft("");
          onChange("");
          close(false);
        }}
      >
        <input
          type="text"
          className={styles.colFilterSearch}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onChange(draft.trim());
              close(false);
            }
          }}
        />
      </FilterPanel>
    </>
  );
}

export function HeaderMultiFilter({
  filterKey,
  openKey,
  onOpenKeyChange,
  title,
  label,
  options,
  value,
  onChange,
  searchable = false,
  searchPlaceholder = "Tìm...",
  minWidth,
}: {
  filterKey: string;
  openKey: OpenKey;
  onOpenKeyChange: (key: OpenKey) => void;
  title: string;
  label: string;
  options: FilterOption[];
  value: string[];
  onChange: (value: string[]) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  minWidth?: number;
}) {
  const [query, setQuery] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = openKey === filterKey;

  const visibleOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => {
      const code = option.person?.employeeCode ?? "";
      return `${option.label} ${code}`.toLowerCase().includes(needle);
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const close = () => onOpenKeyChange(null);

  return (
    <>
      <FilterIconButton
        label={label}
        active={value.length > 0}
        open={open}
        count={value.length}
        buttonRef={buttonRef}
        onToggle={() => onOpenKeyChange(open ? null : filterKey)}
      />
      <FilterPanel
        open={open}
        onClose={close}
        anchorRef={buttonRef}
        minWidth={minWidth}
        title={title}
        onClear={() => {
          onChange([]);
          close();
        }}
      >
        {searchable ? (
          <input
            type="text"
            className={styles.colFilterSearch}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            autoFocus
          />
        ) : null}
        <ul className={styles.colFilterList}>
          {visibleOptions.length === 0 ? (
            <li className={styles.colFilterEmpty}>Không có mục phù hợp</li>
          ) : (
            visibleOptions.map((option) => (
              <li key={option.value}>
                <label className={styles.colFilterItem}>
                  <input
                    type="checkbox"
                    checked={value.includes(option.value)}
                    onChange={() => onChange(toggleValue(value, option.value))}
                  />
                  {option.person !== undefined ? (
                    <GanttPersonCell person={option.person} />
                  ) : (
                    <span>{option.label}</span>
                  )}
                </label>
              </li>
            ))
          )}
        </ul>
      </FilterPanel>
    </>
  );
}

export function HeaderDateFilter({
  filterKey,
  openKey,
  onOpenKeyChange,
  title,
  label,
  value,
  onChange,
}: {
  filterKey: string;
  openKey: OpenKey;
  onOpenKeyChange: (key: OpenKey) => void;
  title: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = openKey === filterKey;
  const close = () => onOpenKeyChange(null);

  return (
    <>
      <FilterIconButton
        label={label}
        active={Boolean(value)}
        open={open}
        buttonRef={buttonRef}
        onToggle={() => onOpenKeyChange(open ? null : filterKey)}
      />
      <FilterPanel
        open={open}
        onClose={close}
        anchorRef={buttonRef}
        minWidth={280}
        title={title}
        onClear={() => {
          onChange("");
          close();
        }}
      >
        <div className={styles.colDateValue}>
          {value ? isoToDmy(value) : "Chưa chọn ngày"}
        </div>
        <MiniCalendar value={value} onSelect={onChange} />
      </FilterPanel>
    </>
  );
}

function isoToDmy(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function MiniCalendar({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (iso: string) => void;
}) {
  const today = toVietnamDateInputValue();
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  const [view, setView] = useState(() => {
    const base = selected || today;
    const [year, month] = base.split("-").map(Number);
    return { year, month: month - 1 };
  });

  useEffect(() => {
    if (!selected) return;
    const [year, month] = selected.split("-").map(Number);
    setView({ year, month: month - 1 });
  }, [selected]);

  const first = new Date(view.year, view.month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: startPad }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className={styles.colCalendar} role="group" aria-label="Chọn ngày">
      <div className={styles.colCalendarHead}>
        <button
          type="button"
          aria-label="Tháng trước"
          onClick={() =>
            setView((current) =>
              current.month === 0
                ? { year: current.year - 1, month: 11 }
                : { year: current.year, month: current.month - 1 },
            )
          }
        >
          ‹
        </button>
        <span>
          Tháng {view.month + 1}/{view.year}
        </span>
        <button
          type="button"
          aria-label="Tháng sau"
          onClick={() =>
            setView((current) =>
              current.month === 11
                ? { year: current.year + 1, month: 0 }
                : { year: current.year, month: current.month + 1 },
            )
          }
        >
          ›
        </button>
      </div>
      <div className={styles.colCalendarWeek}>
        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className={styles.colCalendarGrid}>
        {cells.map((day, index) => {
          if (!day) return <span key={`empty-${index}`} />;
          const iso = `${view.year}-${String(view.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isSelected = iso === selected;
          const isToday = iso === today;
          return (
            <button
              key={iso}
              type="button"
              className={`${styles.colCalendarDay} ${isToday ? styles.colCalendarDayToday : ""} ${isSelected ? styles.colCalendarDaySelected : ""}`}
              onClick={() => onSelect(iso)}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
