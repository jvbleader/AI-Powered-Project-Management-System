import { Surface } from "@/components/ui";
import { FilterSelect } from "@/components/filter-select";

import { roleLabel, userStatusLabel } from "@/lib/utils/format";
import { SYSTEM_ROLE_OPTIONS, type UserDirectoryFilters, type UserStatus } from "@/types";
import styles from "../styles/team.module.css";

const STATUS_OPTIONS: UserStatus[] = ["ACTIVE", "INACTIVE"];

interface TeamFilterProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: UserDirectoryFilters["status"];
  onStatusFilterChange: (value: UserDirectoryFilters["status"]) => void;
  roleFilter: UserDirectoryFilters["role"];
  onRoleFilterChange: (value: UserDirectoryFilters["role"]) => void;
  departmentFilter: UserDirectoryFilters["department"];
  onDepartmentFilterChange: (value: UserDirectoryFilters["department"]) => void;
  departments: { id: number; name: string }[];
  canFilterDepartment?: boolean;
  currentDepartment?: string;
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
}: TeamFilterProps) {
  return (
    <Surface title="Bộ lọc danh sách" kicker="Search & Pagination" className={styles.filterSurface}>
      <div className={styles.filterGrid}>
        <label className={styles.filterField}>
          <span>Tìm nhanh</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Tên, email hoặc mã người dùng"
          />
        </label>

        <label className={styles.filterField}>
          <span>Trạng thái</span>
          <FilterSelect
            value={statusFilter ?? "ALL"}
            onChange={(value) => onStatusFilterChange(value as UserDirectoryFilters["status"])}
            options={[
              { value: "ALL", label: "Tất cả trạng thái" },
              ...STATUS_OPTIONS.map((status) => ({
                value: status,
                label: userStatusLabel(status),
              })),
            ]}
          />
        </label>

        <label className={styles.filterField}>
          <span>Vai trò</span>
          <FilterSelect
            value={roleFilter ?? "ALL"}
            onChange={(value) => onRoleFilterChange(value as UserDirectoryFilters["role"])}
            options={[
              { value: "ALL", label: "Tất cả vai trò" },
              ...SYSTEM_ROLE_OPTIONS.map((role) => ({
                value: role,
                label: roleLabel(role),
              })),
            ]}
          />
        </label>

        <label className={styles.filterField}>
          <span>Phòng ban</span>
          {canFilterDepartment ? (
            <FilterSelect
              value={departmentFilter ?? "ALL"}
              onChange={(value) =>
                onDepartmentFilterChange(value as UserDirectoryFilters["department"])
              }
              options={[
                { value: "ALL", label: "Tất cả phòng ban" },
                { value: "UNASSIGNED", label: "Chưa cập nhật phòng ban" },
                ...departments.map((dept) => ({
                  value: dept.name,
                  label: dept.name,
                })),
              ]}
            />
          ) : (
            <input
              type="text"
              value={currentDepartment || "Chưa cập nhật phòng ban"}
              disabled
              style={{
                backgroundColor: "var(--surface-sunken)",
                color: "var(--ink-light)",
                cursor: "not-allowed",
              }}
            />
          )}
        </label>
      </div>
    </Surface>
  );
}
