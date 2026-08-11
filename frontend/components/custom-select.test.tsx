import { fireEvent, render, screen } from "@testing-library/react";

import { CustomSelect } from "./custom-select";

describe("CustomSelect", () => {
  const originalInnerHeight = window.innerHeight;
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it("renders the menu outside clipping containers and opens above when needed", () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 700,
      bottom: 738,
      left: 20,
      right: 320,
      width: 300,
      height: 38,
      x: 20,
      y: 700,
      toJSON: () => ({}),
    });
    const onChange = jest.fn();

    render(
      <div style={{ overflow: "hidden" }}>
        <CustomSelect
          value="high"
          onChange={onChange}
          options={[
            { value: "low", label: "Thấp" },
            { value: "medium", label: "Trung bình" },
            { value: "high", label: "Cao" },
            { value: "critical", label: "Khẩn cấp" },
          ]}
          testId="task-priority"
        />
      </div>,
    );

    fireEvent.click(screen.getByTestId("task-priority"));

    const menu = screen.getByTestId("task-priority-menu");
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveStyle({
      position: "fixed",
      bottom: "72px",
      maxHeight: "250px",
      overflowY: "auto",
    });

    fireEvent.click(screen.getByRole("option", { name: "Thấp" }));
    expect(onChange).toHaveBeenCalledWith("low");
    expect(screen.queryByTestId("task-priority-menu")).not.toBeInTheDocument();
  });
});
