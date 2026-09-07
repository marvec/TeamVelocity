import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { THEME_STORAGE_KEY } from "../theme/themes";
import { ThemeSwitcher } from "./ThemeSwitcher";

describe("ThemeSwitcher", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("shows the current theme on its trigger", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "poster");
    render(<ThemeSwitcher />);
    expect(screen.getByRole("combobox", { name: "Theme" })).toHaveTextContent("Poster");
  });

  it("defaults to Daylight", () => {
    render(<ThemeSwitcher />);
    expect(screen.getByRole("combobox", { name: "Theme" })).toHaveTextContent("Daylight");
  });
});
