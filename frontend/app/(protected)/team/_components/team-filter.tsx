import { Surface } from "@/components/ui";
import { FilterSelect } from "@/components/filter-select";

import { roleLabel, userStatusLabel, ROLE_DIRECTOR } from "@/lib/utils/format";
import { SYSTEM_ROLE_OPTIONS, type UserStatus } from "@/types";
import styles from "../styles/team.module.css";

const STATUS_OPTIONS: UserStatus[] = ["ACTIVE", "INACTIVE"];

interface TeamFilterProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string[];
  onStatusFilterChange: (value: string[]) => void;
  roleFilter: string[];
  onRoleFilterChange: (value: string[]) => void;
  departmentFilter: string[];
  onDepartmentFilterChange: (value: string[]) => void;
  departments: { id: number; name: string }[];
  canFilterDepartment?: boolean;
  currentDepartment?: string;
  hideDirectorRoles?: boolean;
  onReset: () => void;
}

export function TeamFilter({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  roleFilter,
  onRoleFilterChange,
  departmentFilter,
  onDepartmentFilterChange,
  departments,
  canFilterDepartment = true,
  currentDepartment = "",
  hideDirectorRoles = false,
  onReset,
}: TeamFilterProps) {
  const roleOptions = hideDirectorRoles
    ? SYSTEM_ROLE_OPTIONS.filter(
        (role) => role !== ROLE_DIRECTOR && role !== "Trợ lý giám đốc",
      )
    : SYSTEM_ROLE_OPTIONS;

  const hasActiveFilters =
    search.trim().length > 0 ||
    statusFilter.length > 0 ||
    roleFilter.length > 0 ||
    (canFilterDepartment && departmentFilter.length > 0);

  return (
    <Surface className={styles.filterSurface}>
      <div className={styles.filterGrid}>
        <label className={styles.filterField}>
          <span>Tìm nhanh</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Họ tên hoặc email"
          />
        </label>

        <div className={styles.filterField}>
          <span>Trạng thái</span>
          <FilterSelect
            multiple
            value={statusFilter}
            onChange={onStatusFilterChange}
            placeholder="Chọn trạng thái"
            showSelectAll={false}
            options={STATUS_OPTIONS.map((status) => ({
              value: status,
              label: userStatusLabel(status),
            }))}
          />
        </div>

        <div className={styles.filterField}>
          <span>Vai trò</span>
          <FilterSelect
            multiple
            value={roleFilter}
            onChange={onRoleFilterChange}
            placeholder="Chọn vai trò"
            showSelectAll={false}
            options={roleOptions.map((role) => ({
              value: role,
              label: roleLabel(role),
            }))}
          />
        </div>

        <div className={styles.filterField}>
          <span>Phòng ban</span>
          {canFilterDepartment ? (
            <FilterSelect
              multiple
              value={departmentFilter}
              onChange={onDepartmentFilterChange}
              placeholder="Chọn phòng ban"
              showSelectAll={false}
              options={departments.map((dept) => ({
                value: dept.name,
                label: dept.name,
              }))}
            />
          ) : (
            <input
              type="text"
              value={currentDepartment || "—"}
              disabled
              style={{
                backgroundColor: "var(--surface-sunken)",
                color: "var(--ink-light)",
                cursor: "not-allowed",
              }}
            />
          )}
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
