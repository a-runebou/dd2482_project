import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "./Field";
import { TextInput } from "./TextInput";

describe("Field", () => {
  it("labels the control with the generated id", () => {
    render(
      <Field label="Email address">
        {(control) => <TextInput type="email" {...control} />}
      </Field>,
    );

    const input = screen.getByLabelText("Email address");
    expect(input).toHaveAttribute("id");
    expect(input.id).not.toBe("");
  });

  it("generates a distinct id per field", () => {
    render(
      <>
        <Field label="Start date">
          {(control) => <TextInput type="date" {...control} />}
        </Field>
        <Field label="End date">
          {(control) => <TextInput type="date" {...control} />}
        </Field>
      </>,
    );

    expect(screen.getByLabelText("Start date").id).not.toBe(
      screen.getByLabelText("End date").id,
    );
  });

  it("adds no aria-invalid and no aria-describedby without an error", () => {
    render(
      <Field label="Group name">
        {(control) => <TextInput type="text" {...control} />}
      </Field>,
    );

    const input = screen.getByLabelText("Group name");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("wires aria-invalid and aria-describedby to the error text", () => {
    render(
      <Field label="Group name" error="Enter a group name.">
        {(control) => <TextInput type="text" {...control} />}
      </Field>,
    );

    const input = screen.getByLabelText("Group name");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter a group name.");
    expect(
      document.getElementById(input.getAttribute("aria-describedby") ?? ""),
    ).toHaveTextContent("Enter a group name.");
  });

  it("describes the control with a description alone, without marking it invalid", () => {
    render(
      <Field label="End date" description="The end date is included.">
        {(control) => <TextInput type="date" {...control} />}
      </Field>,
    );

    const input = screen.getByLabelText("End date");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).toHaveAccessibleDescription("The end date is included.");
  });

  it("describes the control with the description and the error, in that order", () => {
    render(
      <Field
        label="End date"
        description="The end date is included."
        error="The end date is before the start date."
      >
        {(control) => <TextInput type="date" {...control} />}
      </Field>,
    );

    const input = screen.getByLabelText("End date");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      "The end date is included. The end date is before the start date.",
    );
  });
});
