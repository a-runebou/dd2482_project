import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { GroupNav } from "./GroupNav";

const SLUG = "6mN4sGh7Rt2Y";

function renderNav(
  current: "detail" | "availability" | "proposals",
  groupName: string | undefined = "Clocks-change workshop",
) {
  render(
    <MemoryRouter>
      <GroupNav slug={SLUG} groupName={groupName} current={current} />
    </MemoryRouter>,
  );
}

describe("GroupNav", () => {
  it("always links back to the groups list", () => {
    renderNav("detail");

    const nav = screen.getByRole("navigation", { name: "Group" });
    expect(
      within(nav).getByRole("link", { name: "Your groups" }),
    ).toHaveAttribute("href", "/groups");
  });

  it("marks the group as the current page on the detail route and shows no sibling links", () => {
    renderNav("detail");

    const nav = screen.getByRole("navigation", { name: "Group" });
    expect(within(nav).getByText("Clocks-change workshop")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(nav).queryByRole("link", { name: "Availability" }),
    ).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Proposals" })).toBeNull();
  });

  it("links back to the group and across to proposals on the availability route", () => {
    renderNav("availability");

    const nav = screen.getByRole("navigation", { name: "Group" });
    expect(
      within(nav).getByRole("link", { name: "Clocks-change workshop" }),
    ).toHaveAttribute("href", `/groups/${SLUG}`);
    expect(within(nav).getByText("Availability")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(nav).getByRole("link", { name: "Proposals" }),
    ).toHaveAttribute("href", `/groups/${SLUG}/proposals`);
  });

  it("links back to the group and across to availability on the proposals route", () => {
    renderNav("proposals");

    const nav = screen.getByRole("navigation", { name: "Group" });
    expect(
      within(nav).getByRole("link", { name: "Clocks-change workshop" }),
    ).toHaveAttribute("href", `/groups/${SLUG}`);
    expect(within(nav).getByText("Proposals")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(nav).getByRole("link", { name: "Availability" }),
    ).toHaveAttribute("href", `/groups/${SLUG}/availability`);
  });

  it("shows a placeholder rather than the word undefined while the group name is not yet known", () => {
    renderNav("availability", undefined);

    const nav = screen.getByRole("navigation", { name: "Group" });
    expect(nav).not.toHaveTextContent("undefined");
    // The crumb is still a link to the group, even without a name to show yet.
    expect(
      within(nav)
        .getAllByRole("link")
        .find((link) => link.getAttribute("href") === `/groups/${SLUG}`),
    ).toBeDefined();
  });
});
