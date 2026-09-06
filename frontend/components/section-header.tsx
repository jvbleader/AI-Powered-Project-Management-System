"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

import styles from "./section-header.module.css";

export type SectionHeaderTab<T extends string = string> = {
  id: T;
  label: string;
  href?: string;
};

type SectionHeaderProps<T extends string = string> = {
  tabs?: Array<SectionHeaderTab<T>>;
  activeTab?: T;
  onTabChange?: (id: T) => void;
  primaryAction?: ReactNode;
  ariaLabel?: string;
};

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function SectionHeader<T extends string = string>({
  tabs = [],
  activeTab,
  onTabChange,
  primaryAction,
  ariaLabel = "Điều hướng",
}: SectionHeaderProps<T>) {
  if (tabs.length === 0 && !primaryAction) {
    return null;
  }

  return (
    <div className={styles.row}>
      {tabs.length > 0 ? (
        <div className={styles.tablist} role="tablist" aria-label={ariaLabel}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const className = classNames(styles.tab, isActive && styles.tabActive);

            const handleClick = (event: MouseEvent<HTMLElement>) => {
              if (!onTabChange) {
                return;
              }
              event.preventDefault();
              onTabChange(tab.id);
            };

            if (tab.href) {
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  role="tab"
                  aria-selected={isActive}
                  aria-current={isActive ? "page" : undefined}
                  className={className}
                  onClick={handleClick}
                >
                  {tab.label}
                </Link>
              );
            }

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={className}
                onClick={() => onTabChange?.(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {primaryAction ? <div className={styles.actions}>{primaryAction}</div> : null}
    </div>
  );
}
