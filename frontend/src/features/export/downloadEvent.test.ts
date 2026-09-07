import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { server } from "../../mocks/server";
import { mockUrl } from "../../mocks/urls";
import {
  confirmedMemberGroupFixture,
  proposalsGroupFixture,
  userFixture,
} from "../../mocks/fixtures";
import { resetMockGroups, resetMockProposals } from "../../mocks/handlers";
import { clearSession, setSession } from "../../api/session";
import type { ApiError } from "../../api/errors";
import { eventFilename, fetchEventIcs, saveBlob } from "./downloadEvent";

const ACCESS_TOKEN = "access-token-for-the-export";

const path = (suffix: string) => new URL(mockUrl(suffix)).pathname;
const ICS_PATH = path(`/groups/${confirmedMemberGroupFixture.slug}/event.ics`);

let counts: Record<string, number>;
let authorization: (string | null)[];

function countRequest({ request }: { request: Request }) {
  const key = `${request.method} ${new URL(request.url).pathname}`;
  counts[key] = (counts[key] ?? 0) + 1;
  authorization.push(request.headers.get("Authorization"));
}

// jsdom implements neither, so both are installed for the test and put back afterwards.
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const originalClick = HTMLAnchorElement.prototype.click;

let clicked: { download: string }[];

beforeEach(() => {
  counts = {};
  authorization = [];
  clicked = [];
  server.events.on("request:start", countRequest);
  resetMockGroups();
  resetMockProposals();
  setSession(ACCESS_TOKEN, userFixture);
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

describe("eventFilename", () => {
  it("derives a safe name from the group's", () => {
    expect(eventFilename("Reading circle, settled")).toBe(
      "reading-circle-settled.ics",
    );
  });

  it("strips path separators and anything else a filesystem would object to", () => {
    expect(eventFilename("../../etc/passwd")).toBe("etc-passwd.ics");
    expect(eventFilename('Q1 "planning" <all>')).toBe("q1-planning-all.ics");
  });

  it("falls back to a generic name when nothing usable is left", () => {
    expect(eventFilename("///")).toBe("event.ics");
    expect(eventFilename("")).toBe("event.ics");
  });
});

describe("fetchEventIcs", () => {
  it("carries the bearer token and returns the document as a blob", async () => {
    const blob = await fetchEventIcs(confirmedMemberGroupFixture.slug);

    expect(await blob.text()).toContain("BEGIN:VCALENDAR");
    expect(counts[`GET ${ICS_PATH}`]).toBe(1);
    expect(authorization).toEqual([`Bearer ${ACCESS_TOKEN}`]);
  });

  it("throws an ApiError carrying the code when the group is not confirmed", async () => {
    const error = await fetchEventIcs(proposalsGroupFixture.slug).then(
      () => undefined,
      (thrown: ApiError) => thrown,
    );

    expect(error).toEqual(
      expect.objectContaining({ kind: "problem", code: "group_not_confirmed" }),
    );
  });
});

describe("saveBlob", () => {
  it("hands the blob to the browser as a download and revokes the object URL", async () => {
    const blob = new Blob(["BEGIN:VCALENDAR"], { type: "text/calendar" });

    saveBlob(blob, "reading-circle.ics");

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked).toEqual([{ download: "reading-circle.ics" }]);
    // Nothing is left in the document once the click has been dispatched.
    expect(document.querySelector("a[download]")).toBeNull();
    await waitFor(() =>
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:schedular/mock"),
    );
  });
});
