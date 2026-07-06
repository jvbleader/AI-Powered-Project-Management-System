import { Surface } from "@/components/ui";
import { CustomSelect } from "@/components/custom-select";
import { roleLabel, userStatusLabel } from "@/lib/utils/format";
import type { UserDirectoryFilters, UserRole, UserStatus } from "@/types";
import styles from "../styles/team.module.css";

const ROLE_OPTIONS: UserRole[] = ["ADMIN", "MANAGER", "LEADER", "MEMBER"];
const STATUS_OPTIONS: UserStatus[] = ["ACTIVE", "INACTIVE"];

interface TeamFilterProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: UserDirectoryFilters["status"];
  onStatusFilterChange: (value: UserDirectoryFilters["status"]) => void;
  roleFilter: UserDirectoryFilters["role"];
  onRoleFilterChange: (value: UserDirectoryFilters["role"]) => void;
}

export function TeamFilter({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  roleFilter,
  onRoleFilterChange,
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
          <CustomSelect
            value={statusFilter ?? "ALL"}
            onChange={(value) => onStatusFilterChange(value as UserDirectoryFilters["status"])}
            options={[
              { label: "Tất cả trạng thái", value: "ALL" },
              ...STATUS_OPTIONS.map((status) => ({
                label: userStatusLabel(status),
                value: status,
              })),
            ]}
          />
        </label>

        <label className={styles.filterField}>
          <span>Vai trò</span>
          <CustomSelect
            value={roleFilter ?? "ALL"}
            onChange={(value) => onRoleFilterChange(value as UserDirectoryFilters["role"])}
            options={[
              { label: "Tất cả vai trò", value: "ALL" },
              ...ROLE_OPTIONS.map((role) => ({
                label: roleLabel(role),
                value: role,
              })),
            ]}
          />
        </label>
      </div>
    </Surface>
  );
}
