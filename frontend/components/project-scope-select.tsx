type ProjectScopeOption = {
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
    <label className="topbar-select">
      <span>{label}</span>
      <div className="topbar-select-control">
        <span className="topbar-select-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h18M6 12h12m-9 4.5h6" />
          </svg>
        </span>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}
