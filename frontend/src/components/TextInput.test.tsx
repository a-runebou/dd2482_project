import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TextInput } from "./TextInput";

describe("TextInput", () => {
  it("forwards its props to the underlying input", () => {
    const onChange = vi.fn();
    render(
      <TextInput
        type="email"
        aria-label="Email address"
        value="a@example.test"
        readOnly
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText("Email address");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveValue("a@example.test");
    expect(input).toHaveAttribute("readonly");
  });

  it("reports changes", () => {
    const onChange = vi.fn();
    render(<TextInput aria-label="Group name" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Group name"), {
      target: { value: "Book club" },
    });
    expect(onChange).toHaveBeenCalled();
  });

  it("forwards a ref to the input element", () => {
    const ref = createRef<HTMLInputElement>();
    render(<TextInput aria-label="Invite link" ref={ref} readOnly value="x" />);

    expect(ref.current).toBe(screen.getByLabelText("Invite link"));
  });

  it("appends a caller's className", () => {
    render(<TextInput aria-label="Group name" className="max-w-48" />);

    const input = screen.getByLabelText("Group name");
    expect(input.className).toContain("max-w-48");
    expect(input.className.split(" ").length).toBeGreaterThan(1);
  });
});
