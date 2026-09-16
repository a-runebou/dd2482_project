import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Textarea } from "./Textarea";

describe("Textarea", () => {
  it("forwards its props to the underlying textarea", () => {
    render(
      <Textarea aria-label="Description" rows={4} defaultValue="Anything" />,
    );

    const textarea = screen.getByLabelText("Description");
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveAttribute("rows", "4");
    expect(textarea).toHaveValue("Anything");
  });

  it("reports changes", () => {
    const onChange = vi.fn();
    render(<Textarea aria-label="Description" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "A weekend away" },
    });
    expect(onChange).toHaveBeenCalled();
  });

  it("appends a caller's className", () => {
    render(<Textarea aria-label="Description" className="mt-2" />);

    expect(screen.getByLabelText("Description").className).toContain("mt-2");
  });
});
