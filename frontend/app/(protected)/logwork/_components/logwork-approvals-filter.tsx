import { Surface } from "@/components/ui";
import { FilterSelect, type FilterOption } from "@/components/filter-select";

import styles from "../logwork-approvals.module.css";

export type LogworkDatePeriod = "" | "day" | "week" | "month";

const DATE_PERIOD_OPTIONS: FilterOption[] = [
  { value: "day", label: "Trong ngày" },
  { value: "week", label: "Trong tuần" },
  { value: "month", label: "Trong tháng" },
];

type LogworkApprovalsFilterProps = {
  projectFilter: string[];
  onProjectFilterChange: (value: string[]) => void;
  projectOptions: FilterOption[];
  staffFilter: string[];
  onStaffFilterChange: (value: string[]) => void;
  staffOptions: FilterOption[];
  datePeriod: LogworkDatePeriod;
  onDatePeriodChange: (value: LogworkDatePeriod) => void;
  hasActiveFilters: boolean;
  onReset: () => void;
};

export function LogworkApprovalsFilter({
  projectFilter,
  onProjectFilterChange,
  projectOptions,
  staffFilter,
  onStaffFilterChange,
  staffOptions,
  datePeriod,
  onDatePeriodChange,
  hasActiveFilters,
  onReset,
}: LogworkApprovalsFilterProps) {
  return (
    <Surface className={styles.filterSurface}>
      <div className={styles.filterGrid}>
        <div className={styles.filterField}>
          <span>Nhân sự</span>
          <FilterSelect
            multiple
            searchable
            searchPlaceholder="Tìm nhân sự..."
            value={staffFilter}
            onChange={onStaffFilterChange}
            placeholder="Chọn nhân sự"
            showSelectAll={false}
            options={staffOptions}
          />
        </div>

        <div className={styles.filterField}>
          <span>Dự án</span>
          <FilterSelect
            multiple
            searchable
            searchPlaceholder="Tìm dự án..."
            value={projectFilter}
            onChange={onProjectFilterChange}
            placeholder="Chọn dự án"
            showSelectAll={false}
            options={projectOptions}
          />
        </div>

        <div className={styles.filterField}>
          <span>Ngày tạo</span>
          <FilterSelect
            value={datePeriod}
            onChange={(value) => onDatePeriodChange(value as LogworkDatePeriod)}
            placeholder="Chọn thời gian"
            options={DATE_PERIOD_OPTIONS}
          />
        </div>

        <div className={styles.filterActions}>
          <button
            type="button"
            className={styles.resetButton}
            disabled={!hasActiveFilters}
            onClick={onReset}
          >
            Xóa lọc
          </button>
        </div>
      </div>
    </Surface>
  );
}
