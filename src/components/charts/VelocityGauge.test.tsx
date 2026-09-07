import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VelocityGauge } from "./VelocityGauge";

describe("VelocityGauge", () => {
  it("renders the rounded value and exposes the band", () => {
    render(<VelocityGauge value={72.4} band="green" />);
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByTestId("velocity-gauge")).toHaveAttribute("data-band", "green");
  });

  it("shows the band as a labelled chip with its threshold range", () => {
    render(<VelocityGauge value={55} band="yellow" thresholds={{ red: 40, green: 70 }} />);
    const chip = screen.getByTestId("band-chip");
    expect(chip).toHaveAttribute("data-band", "yellow");
    expect(chip).toHaveTextContent("40–70");
  });

  it("flags a provisional (warming-up) value", () => {
    render(<VelocityGauge value={30} band="red" warmingUp />);
    expect(screen.getByText("warming up")).toBeInTheDocument();
  });
});
