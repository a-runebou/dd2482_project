import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

// These two tests run in source order. With globals:false, Testing Library's automatic teardown
// is not registered, so the central hook in setup.ts is what unmounts the first test's render
// before the second runs. Without that hook the second test fails.
describe("central cleanup", () => {
  it("renders an element into the document", () => {
    render(<div>leftover content</div>);
    expect(document.body.textContent).toContain("leftover content");
  });

  it("starts with an empty document body", () => {
    expect(document.body).toBeEmptyDOMElement();
  });
});
