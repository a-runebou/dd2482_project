import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Select } from "./Select";

describe("Select", () => {
  it("forwards its props and renders its options", () => {
    render(
      <Select aria-label="Timezone" defaultValue="Europe/Berlin">
        <option value="Europe/Berlin">Europe/Berlin</option>
        <option value="Europe/Stockholm">Europe/Stockholm</option>
      </Select>,
    );

    const select = screen.getByLabelText("Timezone");
    expect(select).toHaveValue("Europe/Berlin");
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("reports changes", () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="Timezone" value="Europe/Berlin" onChange={onChange}>
        <option value="Europe/Berlin">Europe/Berlin</option>
        <option value="Europe/Stockholm">Europe/Stockholm</option>
      </Select>,
    );

    fireEvent.change(screen.getByLabelText("Timezone"), {
      target: { value: "Europe/Stockholm" },
    });
    expect(onChange).toHaveBeenCalled();
  });

  it("appends a caller's className", () => {
    render(
      <Select aria-label="Timezone" className="max-w-48">
        <option value="Europe/Berlin">Europe/Berlin</option>
      </Select>,
    );

    expect(screen.getByLabelText("Timezone").className).toContain("max-w-48");
  });
});
