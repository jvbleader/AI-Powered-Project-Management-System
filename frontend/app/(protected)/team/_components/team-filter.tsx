import { Surface } from "@/components/ui";

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
          <select
            value={statusFilter ?? "ALL"}
            onChange={(event) =>
              onStatusFilterChange(event.target.value as UserDirectoryFilters["status"])
            }
          >
            <option value="ALL">Tất cả trạng thái</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {userStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filterField}>
          <span>Vai trò</span>
          <select
            value={roleFilter ?? "ALL"}
            onChange={(event) =>
              onRoleFilterChange(event.target.value as UserDirectoryFilters["role"])
            }
          >
            <option value="ALL">Tất cả vai trò</option>
            {SYSTEM_ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filterField}>
          <span>Phòng ban</span>
          {canFilterDepartment ? (
            <select
              value={departmentFilter ?? "ALL"}
              onChange={(event) =>
                onDepartmentFilterChange(event.target.value as UserDirectoryFilters["department"])
              }
            >
              <option value="ALL">Tất cả phòng ban</option>
              <option value="UNASSIGNED">Chưa cập nhật phòng ban</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.name}>
                  {dept.name}
                </option>
              ))}
            </select>
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
