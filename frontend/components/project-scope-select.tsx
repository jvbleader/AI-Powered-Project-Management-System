import { FilterSelect } from "./filter-select";

export type ProjectScopeOption = {
  value: string;
  label: string;
};

interface ProjectScopeSelectProps {
  value: string;
  options: ProjectScopeOption[];
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
}

export function ProjectScopeSelect({
  value,
  options,
  onChange,
  label = "Dự án",
  disabled = false,
}: ProjectScopeSelectProps) {
  return (
    <div className="topbar-select" style={{ pointerEvents: disabled ? "none" : "auto", opacity: disabled ? 0.7 : 1 }}>
      <span>{label}</span>
      <div style={{ minWidth: "220px" }}>
        <FilterSelect
          value={value}
          onChange={onChange}
          options={options.map((opt) => ({ value: opt.value, label: opt.label }))}
          placeholder="-- Chọn dự án --"
        />
      </div>
    </div>
  );
}
