"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

type UseAutoPageSizeOptions = {
  rowHeight?: number;
  headerHeight?: number;
  footerHeight?: number;
  bottomGutter?: number;
  min?: number;
  max?: number;
  fallbackTop?: number;
  remeasureKey?: unknown;
  anchorRef?: RefObject<HTMLElement | null>;
};

function getContentBottom(anchor: HTMLElement | null): number {
  const parent = anchor?.closest(".workspace-main");
  if (parent instanceof HTMLElement) {
    const rect = parent.getBoundingClientRect();
    const paddingBottom = parseFloat(window.getComputedStyle(parent).paddingBottom) || 0;
    return rect.bottom - paddingBottom;
  }
  if (window.visualViewport) {
    return window.visualViewport.offsetTop + window.visualViewport.height;
  }
  return window.innerHeight;
}

function measureFromAnchor(
  anchor: HTMLElement | null,
  fallbackTop: number,
  fallbackHeader: number,
  fallbackRow: number,
) {
  const thead = anchor?.querySelector("thead");
  const headerEl = thead instanceof HTMLElement ? thead : null;
  const headerRect = headerEl?.getBoundingClientRect();
  const header = headerRect && headerRect.height > 0 ? headerRect.height : fallbackHeader;
  // Chỉ lấy từ header bảng trở xuống — bỏ phần tiêu đề card phía trên.
  const top = headerRect ? headerRect.top : (anchor?.getBoundingClientRect().top ?? fallbackTop);
  // To prevent infinite loops caused by variable row heights across pages,
  // we strictly use the fallbackRow (which is passed as rowHeight config)
  // instead of measuring the first rendered row dynamically.
  const row = fallbackRow;
  return { top, header, row };
}

function computePageSize({
  rowHeight,
  headerHeight,
  footerHeight,
  bottomGutter,
  min,
  max,
  fallbackTop,
  anchorRef,
}: Required<Omit<UseAutoPageSizeOptions, "anchorRef" | "remeasureKey">> & {
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  if (typeof window === "undefined") return min;

  const anchor = anchorRef?.current ?? null;
  const { top, header, row } = measureFromAnchor(
    anchor,
    fallbackTop,
    headerHeight,
    rowHeight,
  );
  const available = getContentBottom(anchor) - top - header - footerHeight - bottomGutter;
  const rows = Math.floor(available / row);
  return Math.max(min, Math.min(max, rows || min));
}

export function useAutoPageSize({
  rowHeight = 56,
  headerHeight = 48,
  footerHeight = 64,
  bottomGutter = 56,
  min = 4,
  max = 40,
  fallbackTop = 240,
  remeasureKey,
  anchorRef,
}: UseAutoPageSizeOptions = {}) {
  const [pageSize, setPageSize] = useState(min);

  useLayoutEffect(() => {
    const options = {
      rowHeight,
      headerHeight,
      footerHeight,
      bottomGutter,
      min,
      max,
      fallbackTop,
      anchorRef,
    };

    function update() {
      setPageSize((current) => {
        const next = computePageSize(options);
        return next === current ? current : next;
      });
    }

    const frame = window.requestAnimationFrame(update);
    window.addEventListener("resize", update);

    const anchor = anchorRef?.current ?? null;
    const parent = anchor?.closest(".workspace-main");
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(anchor ?? document.documentElement);
    if (parent instanceof HTMLElement) observer?.observe(parent);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [
    anchorRef,
    bottomGutter,
    fallbackTop,
    footerHeight,
    headerHeight,
    max,
    min,
    remeasureKey,
    rowHeight,
  ]);

  return pageSize;
}
