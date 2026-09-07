import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
  it("is a checkbox that reports its state to assistive technology", () => {
    render(
      <label>
        <Checkbox defaultChecked />
        Send reminders
      </label>,
    );

    expect(
      screen.getByRole("checkbox", { name: "Send reminders" }),
    ).toBeChecked();
  });

  it("toggles under the caller's control and forwards the rest of its props", () => {
    function Harness() {
      const [checked, setChecked] = useState(false);
      return (
        <label>
          <Checkbox
            checked={checked}
            aria-describedby="note"
            onChange={(event) => setChecked(event.target.checked)}
          />
          Send reminders
        </label>
      );
    }
    render(<Harness />);

    const box = screen.getByRole("checkbox", { name: "Send reminders" });
    expect(box).not.toBeChecked();
    expect(box).toHaveAttribute("aria-describedby", "note");

    fireEvent.click(box);
    expect(box).toBeChecked();
  });
});
