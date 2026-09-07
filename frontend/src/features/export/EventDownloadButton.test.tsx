import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { server } from "../../mocks/server";
import { mockUrl } from "../../mocks/urls";
import {
  confirmedMemberGroupFixture,
  proposalsGroupFixture,
  userFixture,
} from "../../mocks/fixtures";
import { resetMockGroups, resetMockProposals } from "../../mocks/handlers";
import { clearSession, setSession } from "../../api/session";
import { renderWithProviders } from "../scheduling/testHarness";
import {
  EventDownloadButton,
  NOT_CONFIRMED_MESSAGE,
} from "./EventDownloadButton";

const path = (suffix: string) => new URL(mockUrl(suffix)).pathname;
const ICS_PATH = path(`/groups/${confirmedMemberGroupFixture.slug}/event.ics`);
const OPEN_ICS_PATH = path(`/groups/${proposalsGroupFixture.slug}/event.ics`);

let counts: Record<string, number>;
let clicked: { download: string }[];

function countRequest({ request }: { request: Request }) {
  const key = `${request.method} ${new URL(request.url).pathname}`;
  counts[key] = (counts[key] ?? 0) + 1;
}

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const originalClick = HTMLAnchorElement.prototype.click;

beforeEach(() => {
  counts = {};
  clicked = [];
  server.events.on("request:start", countRequest);
  resetMockGroups();
  resetMockProposals();
  setSession("access-token-for-the-export", userFixture);
  URL.createObjectURL = vi.fn(() => "blob:schedular/mock");
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    clicked.push({ download: this.download });
  };
});

afterEach(() => {
  server.events.removeListener("request:start", countRequest);
  clearSession();
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  HTMLAnchorElement.prototype.click = originalClick;
});

describe("EventDownloadButton", () => {
  it("downloads the file under a name derived from the group's", async () => {
    renderWithProviders(
      <EventDownloadButton
        slug={confirmedMemberGroupFixture.slug}
        groupName={confirmedMemberGroupFixture.name}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /calendar file/i }));

    await waitFor(() =>
      expect(clicked).toEqual([
        { download: "reading-circle-as-a-member-sees-it.ics" },
      ]),
    );
    expect(counts[`GET ${ICS_PATH}`]).toBe(1);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("explains that the group is not confirmed yet rather than showing a failure", async () => {
    renderWithProviders(
      <EventDownloadButton
        slug={proposalsGroupFixture.slug}
        groupName={proposalsGroupFixture.name}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /calendar file/i }));

    expect(await screen.findByText(NOT_CONFIRMED_MESSAGE)).toBeInTheDocument();
    expect(counts[`GET ${OPEN_ICS_PATH}`]).toBe(1);
    expect(clicked).toEqual([]);
  });
});
