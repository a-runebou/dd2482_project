import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { server } from "../../mocks/server";
import { mockUrl } from "../../mocks/urls";
import {
  configFixture,
  createdGroupFixture,
  createdGroupInviteToken,
  createdGroupSlug,
} from "../../mocks/fixtures";
import { createQueryClient } from "../../api/queryClient";
import { CreateGroupForm } from "./CreateGroupForm";
import type { components } from "../../api/generated/schema";

type GroupCreate = components["schemas"]["GroupCreate"];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface Attempt {
  body: GroupCreate;
  key: string | null;
}

let attempts: Attempt[];

/** Record every POST /groups attempt, then answer with whatever the test needs. */
function postGroups(
  respond: (attempt: Attempt) => Response | Promise<Response>,
) {
  return http.post(mockUrl("/groups"), async ({ request }) => {
    const attempt: Attempt = {
      body: (await request.clone().json()) as GroupCreate,
      key: request.headers.get("Idempotency-Key"),
    };
    attempts.push(attempt);
    return respond(attempt);
  });
}

function problem(
  status: number,
  body: Partial<components["schemas"]["Problem"]> &
    Pick<components["schemas"]["Problem"], "code">,
): Response {
  return HttpResponse.json(
    { type: "about:blank", title: "Error", status, ...body },
    { status, headers: { "content-type": "application/problem+json" } },
  ) as unknown as Response;
}

function renderForm(): QueryClient {
  const client = createQueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CreateGroupForm />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

/** Wait for GET /config, which gates the form, then fill in the fields the test cares about. */
async function fillValidForm(): Promise<void> {
  const name = await screen.findByLabelText("Group name");
  fireEvent.change(name, { target: { value: "Algorithms study group" } });
  fireEvent.change(screen.getByLabelText("Start date"), {
    target: { value: "2026-10-01" },
  });
  fireEvent.change(screen.getByLabelText("End date"), {
    target: { value: "2026-10-05" },
  });
}

function submit(): void {
  fireEvent.click(screen.getByRole("button", { name: "Create group" }));
}

describe("CreateGroupForm", () => {
  beforeEach(() => {
    attempts = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the contract body with a UUID idempotency key and shows the invite link", async () => {
    server.use(
      postGroups(
        ({ body }) =>
          HttpResponse.json(createdGroupFixture(body), {
            status: 201,
          }) as unknown as Response,
      ),
    );

    const client = renderForm();
    client.setQueryData(["groups", "list"], { pages: [], pageParams: [] });

    await fillValidForm();
    submit();

    expect(
      await screen.findByRole("heading", { name: "Group created" }),
    ).toBeInTheDocument();

    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.body).toEqual({
      name: "Algorithms study group",
      timezone: "Europe/Stockholm",
      date_start: "2026-10-01",
      date_end: "2026-10-05",
      window_start_minute: 480,
      window_end_minute: 1080,
    });
    expect(attempts[0]!.body).not.toHaveProperty("description");
    expect(attempts[0]!.key).toMatch(UUID_PATTERN);

    expect(screen.getByText("Algorithms study group")).toBeInTheDocument();
    expect(screen.getByLabelText("Invite link")).toHaveValue(
      `${globalThis.location.origin}/join/${createdGroupSlug}?invite=${createdGroupInviteToken}`,
    );
    expect(client.getQueryState(["groups", "list"])?.isInvalidated).toBe(true);
  });

  it("includes a description only when one was typed", async () => {
    server.use(
      postGroups(
        ({ body }) =>
          HttpResponse.json(createdGroupFixture(body), {
            status: 201,
          }) as unknown as Response,
      ),
    );

    renderForm();
    await fillValidForm();
    fireEvent.change(screen.getByLabelText("Description (optional)"), {
      target: { value: "Weekly problem sessions" },
    });
    submit();

    await screen.findByRole("heading", { name: "Group created" });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.body.description).toBe("Weekly problem sessions");
  });

  it("sends one request for a rapid double click", async () => {
    server.use(
      postGroups(
        ({ body }) =>
          HttpResponse.json(createdGroupFixture(body), {
            status: 201,
          }) as unknown as Response,
      ),
    );

    renderForm();
    await fillValidForm();
    const button = screen.getByRole("button", { name: "Create group" });
    fireEvent.click(button);
    fireEvent.click(button);

    await screen.findByRole("heading", { name: "Group created" });
    expect(attempts).toHaveLength(1);
  });

  it("shows the network notice and retries with the same idempotency key", async () => {
    server.use(postGroups(() => HttpResponse.error() as unknown as Response));

    renderForm();
    await fillValidForm();
    submit();

    expect(
      await screen.findByText(
        "We could not reach the server. Check your connection and try again.",
      ),
    ).toBeInTheDocument();
    expect(attempts).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(attempts).toHaveLength(2));
    expect(attempts[1]!.key).toBe(attempts[0]!.key);
    expect(attempts[1]!.body).toEqual(attempts[0]!.body);
  });

  it("uses a new idempotency key once a field has been edited", async () => {
    server.use(postGroups(() => HttpResponse.error() as unknown as Response));

    renderForm();
    await fillValidForm();
    submit();

    await screen.findByRole("button", { name: "Retry" });
    expect(attempts).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("Group name"), {
      target: { value: "Algorithms reading group" },
    });
    submit();

    await waitFor(() => expect(attempts).toHaveLength(2));
    expect(attempts[1]!.key).not.toBe(attempts[0]!.key);
    expect(attempts[1]!.body.name).toBe("Algorithms reading group");
  });

  it("places a validation_failed field error at its field and the rest at form level", async () => {
    server.use(
      postGroups(() =>
        problem(400, {
          code: "validation_failed",
          title: "Bad Request",
          detail: "leaked-detail",
          errors: [
            { field: "name", message: "That name is already taken." },
            { field: "body.mystery", message: "Unrecognised value." },
          ],
        }),
      ),
    );

    renderForm();
    await fillValidForm();
    submit();

    const nameInput = await screen.findByLabelText("Group name");
    await waitFor(() =>
      expect(nameInput).toHaveAccessibleDescription(
        "That name is already taken.",
      ),
    );
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Unrecognised value.")).toBeInTheDocument();

    expect(screen.queryByText("leaked-detail")).not.toBeInTheDocument();
    expect(screen.queryByText("Bad Request")).not.toBeInTheDocument();
    expect(attempts).toHaveLength(1);
  });

  it("reports range_too_long with the configured limit", async () => {
    server.use(postGroups(() => problem(422, { code: "range_too_long" })));

    renderForm();
    await fillValidForm();
    submit();

    expect(
      await screen.findByText(
        `The range cannot be longer than ${configFixture.max_range_days} days.`,
      ),
    ).toBeInTheDocument();
    expect(attempts).toHaveLength(1);
  });

  it("asks an unauthenticated caller to sign in, without a retry button", async () => {
    server.use(postGroups(() => problem(401, { code: "unauthenticated" })));

    renderForm();
    await fillValidForm();
    submit();

    expect(
      await screen.findByText("Please sign in to see this."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
    expect(attempts).toHaveLength(1);
  });

  it("disables the submit button while the request is in flight", async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      postGroups(async ({ body }) => {
        await held;
        return HttpResponse.json(createdGroupFixture(body), {
          status: 201,
        }) as unknown as Response;
      }),
    );

    renderForm();
    await fillValidForm();
    submit();

    const button = screen.getByRole("button", {
      name: /creating|create group/i,
    });
    await waitFor(() => expect(button).toBeDisabled());

    release?.();
    await screen.findByRole("heading", { name: "Group created" });
  });

  describe("UX validation blocks the request", () => {
    it("requires a name", async () => {
      server.use(
        postGroups(() => HttpResponse.json({}) as unknown as Response),
      );

      renderForm();
      await fillValidForm();
      fireEvent.change(screen.getByLabelText("Group name"), {
        target: { value: "   " },
      });
      submit();

      expect(
        await screen.findByText("Enter a name for the group."),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Group name")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(attempts).toHaveLength(0);
    });

    it("requires both dates", async () => {
      server.use(
        postGroups(() => HttpResponse.json({}) as unknown as Response),
      );

      renderForm();
      await screen.findByLabelText("Group name");
      fireEvent.change(screen.getByLabelText("Group name"), {
        target: { value: "Algorithms study group" },
      });
      submit();

      expect(
        await screen.findByText("Choose a start date."),
      ).toBeInTheDocument();
      expect(screen.getByText("Choose an end date.")).toBeInTheDocument();
      expect(attempts).toHaveLength(0);
    });

    it("rejects an end date before the start date", async () => {
      server.use(
        postGroups(() => HttpResponse.json({}) as unknown as Response),
      );

      renderForm();
      await fillValidForm();
      fireEvent.change(screen.getByLabelText("End date"), {
        target: { value: "2026-09-30" },
      });
      submit();

      expect(
        await screen.findByText(
          "The end date cannot be before the start date.",
        ),
      ).toBeInTheDocument();
      expect(attempts).toHaveLength(0);
    });

    it("rejects a range longer than the configured limit", async () => {
      server.use(
        postGroups(() => HttpResponse.json({}) as unknown as Response),
      );

      renderForm();
      await fillValidForm();
      fireEvent.change(screen.getByLabelText("End date"), {
        target: { value: "2026-10-14" },
      });
      submit();

      expect(
        await screen.findByText(
          `The range cannot be longer than ${configFixture.max_range_days} days.`,
        ),
      ).toBeInTheDocument();
      expect(attempts).toHaveLength(0);
    });

    it("rejects a window that does not start before it ends", async () => {
      server.use(
        postGroups(() => HttpResponse.json({}) as unknown as Response),
      );

      renderForm();
      await fillValidForm();
      fireEvent.change(screen.getByLabelText("Day starts at"), {
        target: { value: "1080" },
      });
      submit();

      expect(
        await screen.findByText(
          "The end of the day must be after the start of the day.",
        ),
      ).toBeInTheDocument();
      expect(attempts).toHaveLength(0);
    });
  });

  describe("copying the invite link", () => {
    async function createGroup(): Promise<string> {
      server.use(
        postGroups(
          ({ body }) =>
            HttpResponse.json(createdGroupFixture(body), {
              status: 201,
            }) as unknown as Response,
        ),
      );
      renderForm();
      await fillValidForm();
      submit();
      await screen.findByRole("heading", { name: "Group created" });
      return `${globalThis.location.origin}/join/${createdGroupSlug}?invite=${createdGroupInviteToken}`;
    }

    it("writes the invite link to the clipboard and confirms", async () => {
      const writeText = vi.fn<(text: string) => Promise<void>>(() =>
        Promise.resolve(),
      );
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });

      try {
        const inviteUrl = await createGroup();
        fireEvent.click(screen.getByRole("button", { name: "Copy" }));

        expect(await screen.findByText("Copied")).toBeInTheDocument();
        expect(writeText).toHaveBeenCalledWith(inviteUrl);
      } finally {
        Reflect.deleteProperty(navigator, "clipboard");
      }
    });

    it("selects the text and explains the shortcut when there is no clipboard API", async () => {
      // jsdom defines no navigator.clipboard, which is also the case in a non-secure
      // context: the plain-HTTP development VM of ARCHITECTURE R1.
      expect(navigator.clipboard).toBeUndefined();

      await createGroup();
      const input = screen.getByLabelText("Invite link");
      const select = vi.spyOn(input as HTMLInputElement, "select");

      fireEvent.click(screen.getByRole("button", { name: "Copy" }));

      expect(
        await screen.findByText("Press Ctrl+C or Cmd+C to copy the link."),
      ).toBeInTheDocument();
      expect(select).toHaveBeenCalled();
    });

    it("falls back to the shortcut message when the clipboard call rejects", async () => {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: () => Promise.reject(new Error("denied")) },
        configurable: true,
      });

      try {
        await createGroup();
        fireEvent.click(screen.getByRole("button", { name: "Copy" }));

        expect(
          await screen.findByText("Press Ctrl+C or Cmd+C to copy the link."),
        ).toBeInTheDocument();
      } finally {
        Reflect.deleteProperty(navigator, "clipboard");
      }
    });
  });
});
