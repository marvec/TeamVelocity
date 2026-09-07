import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BandChip } from "./BandChip";

describe("BandChip", () => {
  it("names the band and its threshold range", () => {
    render(<BandChip band="yellow" thresholds={{ red: 40, green: 70 }} />);
    const chip = screen.getByTestId("band-chip");
    expect(chip).toHaveAttribute("data-band", "yellow");
    expect(chip).toHaveTextContent("yellow");
    expect(chip).toHaveTextContent("40–70");
  });

  it("uses '<' and '≥' for the outer bands", () => {
    const { rerender } = render(<BandChip band="red" thresholds={{ red: 40, green: 70 }} />);
    expect(screen.getByTestId("band-chip")).toHaveTextContent("< 40");
    rerender(<BandChip band="green" thresholds={{ red: 40, green: 70 }} />);
    expect(screen.getByTestId("band-chip")).toHaveTextContent("≥ 70");
  });

  it("shows only the band name without thresholds", () => {
    render(<BandChip band="green" />);
    expect(screen.getByTestId("band-chip")).toHaveTextContent(/^green$/);
  });
});
