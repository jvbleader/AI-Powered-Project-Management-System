import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import {
  FilterSelect,
  formatMultiSelectLabel,
  toggleMultiSelectValue,
  toggleSelectAll,
} from "./filter-select";

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Đang triển khai" },
  { value: "PLANNING", label: "Đang lập kế hoạch" },
  { value: "AT_RISK", label: "Rủi ro trễ hạn" },
];

describe("formatMultiSelectLabel", () => {
  it("shows the all-label when nothing is selected", () => {
    expect(formatMultiSelectLabel([], "Tất cả trạng thái")).toBe("Tất cả trạng thái");
  });

  it("shows the selected name when one item is chosen", () => {
    expect(formatMultiSelectLabel(["Đang triển khai"], "Tất cả trạng thái")).toBe("Đang triển khai");
  });

  it("shows the first name plus remaining count when many items are chosen", () => {
    expect(formatMultiSelectLabel(["Đang triển khai", "Rủi ro trễ hạn"], "Tất cả trạng thái")).toBe(
      "Đang triển khai +1",
    );
  });
});

describe("toggleSelectAll", () => {
  const allValues = ["ACTIVE", "PLANNING", "AT_RISK"];

  it("selects every option when none or some are chosen", () => {
    expect(toggleSelectAll([], allValues)).toEqual(allValues);
    expect(toggleSelectAll(["ACTIVE"], allValues)).toEqual(allValues);
  });

  it("clears the selection when every option is already chosen", () => {
    expect(toggleSelectAll(allValues, allValues)).toEqual([]);
  });
});

describe("toggleMultiSelectValue", () => {
  const allValues = ["ACTIVE", "PLANNING", "AT_RISK"];

  it("turns an empty selection into a single value immediately", () => {
    expect(toggleMultiSelectValue([], "ACTIVE", allValues)).toEqual(["ACTIVE"]);
  });

  it("accumulates values with OR semantics", () => {
    expect(toggleMultiSelectValue(["ACTIVE"], "AT_RISK", allValues)).toEqual(["ACTIVE", "AT_RISK"]);
  });

  it("keeps every option when all are ticked instead of collapsing to empty", () => {
    expect(toggleMultiSelectValue(["ACTIVE", "PLANNING"], "AT_RISK", allValues)).toEqual(allValues);
  });

  it("clears the selection when ALL is chosen", () => {
    expect(toggleMultiSelectValue(["ACTIVE", "AT_RISK"], "ALL", allValues)).toEqual([]);
  });
});

function MultipleFilterHarness({ onChange }: { onChange: (value: string[]) => void }) {
  const [value, setValue] = useState<string[]>([]);
  return (
    <div style={{ overflow: "hidden" }}>
      <FilterSelect
        multiple
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
        allLabel="Tất cả trạng thái"
        options={STATUS_OPTIONS}
      />
    </div>
  );
}

describe("FilterSelect", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 80,
      bottom: 118,
      left: 20,
      right: 220,
      width: 200,
      height: 38,
      x: 20,
      y: 80,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("applies each tick immediately, stays open, and can reset", () => {
    const onChange = jest.fn();
    render(<MultipleFilterHarness onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Tất cả trạng thái" }));

    const first = screen.getByRole("checkbox", { name: "Đang triển khai" });
    fireEvent.click(first);
    expect(onChange).toHaveBeenLastCalledWith(["ACTIVE"]);
    expect(first).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Rủi ro trễ hạn" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Rủi ro trễ hạn" }));
    expect(onChange).toHaveBeenLastCalledWith(["ACTIVE", "AT_RISK"]);
    expect(screen.getByRole("button", { name: "Đang triển khai +1" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Đang lập kế hoạch" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Xóa lọc" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(screen.getByRole("button", { name: "Tất cả trạng thái" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Đang triển khai" })).toBeInTheDocument();
  });

  it("toggles every option from Chọn tất cả and supports the indeterminate state", () => {
    const onChange = jest.fn();
    render(<MultipleFilterHarness onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Tất cả trạng thái" }));
    const selectAll = screen.getByRole("checkbox", { name: "Chọn tất cả" });
    expect(selectAll).not.toBeChecked();

    fireEvent.click(selectAll);
    expect(onChange).toHaveBeenLastCalledWith(["ACTIVE", "PLANNING", "AT_RISK"]);
    expect(selectAll).toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: "Rủi ro trễ hạn" }));
    expect(onChange).toHaveBeenLastCalledWith(["ACTIVE", "PLANNING"]);
    expect(selectAll).not.toBeChecked();

    fireEvent.click(selectAll);
    expect(onChange).toHaveBeenLastCalledWith(["ACTIVE", "PLANNING", "AT_RISK"]);

    fireEvent.click(selectAll);
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(selectAll).not.toBeChecked();
  });

  it("stays open when clicking outside and only closes on its own trigger", () => {
    const onChange = jest.fn();
    render(<MultipleFilterHarness onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Tất cả trạng thái" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Đang triển khai" }));
    expect(screen.getByRole("checkbox", { name: "Rủi ro trễ hạn" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);
    expect(screen.getByRole("checkbox", { name: "Đang triển khai" })).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(["ACTIVE"]);

    fireEvent.click(screen.getByRole("button", { name: "Đang triển khai" }));
    expect(screen.queryByRole("checkbox", { name: "Đang triển khai" })).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(["ACTIVE"]);
  });

  it("keeps single-select behavior: apply and close", () => {
    const onChange = jest.fn();
    render(
      <FilterSelect
        value="ACTIVE"
        onChange={onChange}
        options={STATUS_OPTIONS}
        placeholder="Tất cả trạng thái"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Đang triển khai" }));
    fireEvent.click(screen.getByRole("option", { name: "Rủi ro trễ hạn" }));
    expect(onChange).toHaveBeenCalledWith("AT_RISK");
    expect(screen.queryByRole("option", { name: "Rủi ro trễ hạn" })).not.toBeInTheDocument();
  });
});

const ROLE_OPTIONS = [
  { value: "dev", label: "Lập trình viên" },
  { value: "qc", label: "QC" },
  { value: "manager", label: "Manager" },
];

const DEPT_OPTIONS = [
  { value: "engineering", label: "Kỹ thuật" },
  { value: "qa", label: "QA" },
];

function IndependentFiltersHarness({
  onRolesChange,
  onDeptsChange,
}: {
  onRolesChange: (value: string[]) => void;
  onDeptsChange: (value: string[]) => void;
}) {
  const [roles, setRoles] = useState<string[]>([]);
  const [depts, setDepts] = useState<string[]>([]);
  return (
    <div>
      <FilterSelect
        multiple
        value={roles}
        onChange={(next) => {
          setRoles(next);
          onRolesChange(next);
        }}
        allLabel="Tất cả vai trò"
        options={ROLE_OPTIONS}
      />
      <FilterSelect
        multiple
        value={depts}
        onChange={(next) => {
          setDepts(next);
          onDeptsChange(next);
        }}
        allLabel="Tất cả phòng ban"
        options={DEPT_OPTIONS}
      />
    </div>
  );
}

describe("FilterSelect independent menus", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 80,
      bottom: 118,
      left: 20,
      right: 220,
      width: 200,
      height: 38,
      x: 20,
      y: 80,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("keeps ticks and stays open when another filter is opened", () => {
    const onRolesChange = jest.fn();
    const onDeptsChange = jest.fn();
    render(<IndependentFiltersHarness onRolesChange={onRolesChange} onDeptsChange={onDeptsChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Tất cả vai trò" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Lập trình viên" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "QC" }));
    expect(onRolesChange).toHaveBeenLastCalledWith(["dev", "qc"]);
    expect(screen.getByRole("button", { name: "Lập trình viên +1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tất cả phòng ban" }));
    expect(screen.getByRole("checkbox", { name: "Lập trình viên" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Kỹ thuật" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lập trình viên +1" })).toBeInTheDocument();
    expect(onRolesChange).toHaveBeenLastCalledWith(["dev", "qc"]);
    expect(onDeptsChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox", { name: "Kỹ thuật" }));
    expect(onDeptsChange).toHaveBeenLastCalledWith(["engineering"]);
    expect(onRolesChange).toHaveBeenLastCalledWith(["dev", "qc"]);
    expect(screen.getByRole("button", { name: "Lập trình viên +1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kỹ thuật" })).toBeInTheDocument();
  });
});
