"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import styles from "./filter-select.module.css";

export type FilterOption = {
  value: string;
  label: string;
};

type FilterSelectBaseProps = {
  options: FilterOption[];
  placeholder?: string;
  className?: string;
  onEditClick?: (value: string) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  size?: "default" | "lg";
  disabled?: boolean;
  allLabel?: string;
  showSelectAll?: boolean;
};

type FilterSelectSingleProps = FilterSelectBaseProps & {
  multiple?: false;
  value: string;
  onChange: (value: string) => void;
};

type FilterSelectMultipleProps = FilterSelectBaseProps & {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
};

export type FilterSelectProps = FilterSelectSingleProps | FilterSelectMultipleProps;

type MenuPosition = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

const MENU_GAP = 6;
const MENU_MAX_HEIGHT = 320;
const VIEWPORT_MARGIN = 8;
const MIN_SPACE_BEFORE_FLIPPING = 160;

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function selectedInOptionOrder(options: FilterOption[], selected: string[]) {
  const selectedSet = new Set(selected);
  return options.filter((option) => selectedSet.has(option.value));
}

export function formatMultiSelectLabel(selectedLabels: string[], allLabel: string) {
  if (selectedLabels.length === 0) return allLabel;
  if (selectedLabels.length === 1) return selectedLabels[0];
  return `${selectedLabels[0]} +${selectedLabels.length - 1}`;
}

export function toggleMultiSelectValue(
  current: string[],
  toggled: string,
  allValues: string[],
): string[] {
  if (toggled === "ALL") return [];

  const selected = new Set(current);
  if (selected.has(toggled)) selected.delete(toggled);
  else selected.add(toggled);

  return allValues.filter((value) => selected.has(value));
}

export function getSelectAllState(
  selected: string[],
  allValues: string[],
): "checked" | "unchecked" | "indeterminate" {
  if (allValues.length === 0) return "unchecked";
  const selectedSet = new Set(selected);
  let matched = 0;
  allValues.forEach((value) => {
    if (selectedSet.has(value)) matched += 1;
  });
  if (matched === 0) return "unchecked";
  if (matched === allValues.length) return "checked";
  return "indeterminate";
}

export function toggleSelectAll(selected: string[], allValues: string[]): string[] {
  return getSelectAllState(selected, allValues) === "checked" ? [] : [...allValues];
}

export function useIndeterminateCheckbox(state: "checked" | "unchecked" | "indeterminate") {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = state === "indeterminate";
    }
  }, [state]);
  return ref;
}

function MinusIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CheckIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function FilterSelect(props: FilterSelectProps) {
  const {
    options,
    placeholder = "-- Chọn trạng thái --",
    className = "",
    onEditClick,
    searchable = false,
    searchPlaceholder = "Tìm kiếm...",
    size = "default",
    disabled = false,
    allLabel,
    showSelectAll = true,
  } = props;
  const isMultiple = props.multiple === true;
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const multipleValues = isMultiple ? props.value : [];
  const valueRef = useRef(multipleValues);
  const onChangeRef = useRef(props.onChange);
  valueRef.current = multipleValues;
  onChangeRef.current = props.onChange;

  const selectableOptions = useMemo(
    () => (isMultiple ? options.filter((option) => option.value && option.value !== "ALL") : options),
    [isMultiple, options],
  );
  const selectableValues = useMemo(
    () => selectableOptions.map((option) => option.value),
    [selectableOptions],
  );

  const updateMenuPosition = useCallback(() => {
    if (!wrapRef.current) return;

    const triggerRect = wrapRef.current.getBoundingClientRect();
    const availableBelow = window.innerHeight - triggerRect.bottom - MENU_GAP - VIEWPORT_MARGIN;
    const availableAbove = triggerRect.top - MENU_GAP - VIEWPORT_MARGIN;
    const openAbove = availableBelow < MIN_SPACE_BEFORE_FLIPPING && availableAbove > availableBelow;
    const availableHeight = Math.max(0, openAbove ? availableAbove : availableBelow);
    const width = Math.min(
      Math.max(triggerRect.width, size === "lg" ? 280 : 180),
      Math.max(0, window.innerWidth - VIEWPORT_MARGIN * 2),
    );
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
  }, [size]);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setSearchQuery("");
    setMenuPosition(null);
  }, []);

  const openMenu = useCallback(() => {
    updateMenuPosition();
    setIsOpen(true);
  }, [updateMenuPosition]);

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
    if (isOpen && searchable) {
      const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen, searchable]);

  const singleValue = isMultiple ? "" : props.value;
  const selectedOptions = useMemo(
    () => selectedInOptionOrder(selectableOptions, multipleValues),
    [selectableOptions, multipleValues],
  );

  const filteredOptions = useMemo(() => {
    const source = isMultiple ? selectableOptions : options;
    if (!searchable || !searchQuery.trim()) return source;
    const query = searchQuery.trim().toLowerCase();
    return source.filter(
      (option) =>
        option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query),
    );
  }, [isMultiple, options, searchable, searchQuery, selectableOptions]);

  const isLarge = size === "lg";
  const selectAllState = getSelectAllState(multipleValues, selectableValues);
  const selectAllRef = useIndeterminateCheckbox(selectAllState);
  const hasSelection = isMultiple && multipleValues.length > 0;
  const fallbackAllLabel =
    allLabel || options.find((option) => option.value === "ALL")?.label || placeholder;
  const triggerLabel = isMultiple
    ? formatMultiSelectLabel(
        selectedOptions.map((option) => option.label),
        fallbackAllLabel,
      )
    : options.find((option) => option.value === singleValue)?.label || placeholder;

  function emitMultiple(next: string[]) {
    valueRef.current = next;
    if (props.multiple === true) {
      (onChangeRef.current as (value: string[]) => void)(next);
    }
  }

  function toggleMultipleValue(nextValue: string) {
    if (props.multiple !== true) return;
    emitMultiple(toggleMultiSelectValue(valueRef.current, nextValue, selectableValues));
  }

  const menu =
    isOpen && menuPosition
      ? createPortal(
          <div
            ref={menuRef}
            className={classNames(styles.menu, isLarge && styles.menuLarge)}
            style={{
              left: menuPosition.left,
              width: menuPosition.width,
              top: menuPosition.top,
              bottom: menuPosition.bottom,
              maxHeight: menuPosition.maxHeight,
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {searchable ? (
              <div className={styles.searchWrap}>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={searchPlaceholder}
                  onClick={(event) => event.stopPropagation()}
                  className={styles.searchInput}
                />
              </div>
            ) : null}

            <ul
              className={classNames(styles.list, isLarge && styles.listLarge)}
              role="listbox"
              aria-multiselectable={isMultiple || undefined}
            >
              {isMultiple && showSelectAll && selectableValues.length > 0 ? (
                <>
                  <li>
                    <label
                      className={classNames(styles.item, selectAllState === "checked" && styles.itemSelected)}
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        className={styles.nativeCheckbox}
                        checked={selectAllState === "checked"}
                        onChange={() => emitMultiple(toggleSelectAll(valueRef.current, selectableValues))}
                      />
                      <span
                        className={classNames(
                          styles.checkbox,
                          selectAllState === "checked" && styles.checkboxChecked,
                          selectAllState === "indeterminate" && styles.checkboxIndeterminate,
                        )}
                        aria-hidden
                      >
                        {selectAllState === "checked" ? <CheckIcon /> : selectAllState === "indeterminate" ? <MinusIcon /> : null}
                      </span>
                      <span className={styles.itemLabel}>Chọn tất cả</span>
                    </label>
                  </li>
                  <li className={styles.selectAllDivider} aria-hidden />
                </>
              ) : null}

              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => {
                  const selected = isMultiple
                    ? multipleValues.includes(option.value)
                    : singleValue === option.value;

                  if (isMultiple) {
                    return (
                      <li key={option.value}>
                        <label
                          className={classNames(styles.item, selected && styles.itemSelected)}
                          onMouseDown={(event) => event.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            className={styles.nativeCheckbox}
                            checked={selected}
                            onChange={() => toggleMultipleValue(option.value)}
                          />
                          <span className={classNames(styles.checkbox, selected && styles.checkboxChecked)} aria-hidden>
                            {selected ? <CheckIcon /> : null}
                          </span>
                          <span className={styles.itemLabel}>{option.label}</span>
                        </label>
                      </li>
                    );
                  }

                  return (
                    <li key={option.value || "__all__"}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={classNames(styles.item, selected && styles.itemSelected)}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          (onChangeRef.current as (value: string) => void)(option.value);
                          closeMenu();
                        }}
                      >
                        {selected ? (
                          <CheckIcon size={14} />
                        ) : (
                          <span style={{ width: 14, flexShrink: 0 }} />
                        )}
                        <span className={styles.itemLabel}>{option.label}</span>
                      </button>
                    </li>
                  );
                })
              ) : (
                <li className={styles.empty}>Không tìm thấy kết quả</li>
              )}
            </ul>

            {isMultiple ? (
              <div className={styles.footer}>
                <button
                  type="button"
                  className={styles.resetButton}
                  disabled={!hasSelection}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleMultipleValue("ALL");
                  }}
                >
                  Xóa lọc
                </button>
              </div>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} className={classNames(styles.wrap, isLarge && styles.wrapLarge)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (isOpen) {
            closeMenu();
            return;
          }
          openMenu();
        }}
        className={classNames(
          styles.trigger,
          isLarge && styles.triggerLarge,
          isOpen && styles.triggerOpen,
          className,
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className={styles.triggerLabel}>
          {!isMultiple && onEditClick && singleValue ? (
            <div
              onClick={(event) => {
                event.stopPropagation();
                onEditClick(singleValue);
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
          ) : null}
          <span className={styles.triggerText}>{triggerLabel}</span>
        </div>
        <span className={styles.chevron}>
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
      {menu}
    </div>
  );
}
