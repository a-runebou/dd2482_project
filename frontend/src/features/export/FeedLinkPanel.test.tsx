import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { feedUrlFixture } from "../../mocks/fixtures";
import { FeedLinkPanel } from "./FeedLinkPanel";

const FEED_URL = feedUrlFixture("5qS9vLe4Yw1D");

const originalClipboard = navigator.clipboard;

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: originalClipboard,
    configurable: true,
    writable: true,
  });
});

function stubClipboard(writeText: () => Promise<void>): void {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
}

describe("FeedLinkPanel", () => {
  it("shows the link and warns that anyone holding it can subscribe", () => {
    render(<FeedLinkPanel feedUrl={FEED_URL} />);

    expect(screen.getByLabelText(/calendar feed link/i)).toHaveValue(FEED_URL);
    expect(
      screen.getByText(/anyone with this link can subscribe/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/rotate/i)).toBeInTheDocument();
  });

  it("copies through the clipboard when one is available", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);

    render(<FeedLinkPanel feedUrl={FEED_URL} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith(FEED_URL);
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("falls back to selecting the field when the clipboard refuses", async () => {
    stubClipboard(() => Promise.reject(new Error("no secure context")));

    render(<FeedLinkPanel feedUrl={FEED_URL} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(
      await screen.findByText(/press ctrl\+c or cmd\+c/i),
    ).toBeInTheDocument();
  });
});
