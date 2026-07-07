import { render } from "@testing-library/react";
import { NavIcon } from "./nav-icon";

describe("NavIcon Component", () => {
  it("renders layers icon correctly", () => {
    const { container } = render(<NavIcon icon="layers" />);
    // SVG should be rendered
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders kanban icon correctly", () => {
    const { container } = render(<NavIcon icon="kanban" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders default icon when unknown icon is passed", () => {
    const { container } = render(<NavIcon icon="unknown-icon" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
