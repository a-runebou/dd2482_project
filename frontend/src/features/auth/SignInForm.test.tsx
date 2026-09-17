import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { server } from "../../mocks/server";
import { mockUrl } from "../../mocks/urls";
import { createQueryClient } from "../../api/queryClient";
import { SignInForm } from "./SignInForm";
import type { components } from "../../api/generated/schema";

interface Attempt {
  email: string;
  redirect_path?: string;
}

let attempts: Attempt[];

/** Record every POST /auth/magic-link attempt, then answer with whatever the test needs. */
function postMagicLink(
  respond: (attempt: Attempt) => Response | Promise<Response>,
) {
  return http.post(mockUrl("/auth/magic-link"), async ({ request }) => {
    const body = (await request.clone().json()) as Attempt;
    const attempt: Attempt = {
      email: body.email,
      redirect_path: body.redirect_path,
    };
    attempts.push(attempt);
    return respond(attempt);
  });
}

function problem(
  status: number,
  body: Partial<components["schemas"]["Problem"]> &
    Pick<components["schemas"]["Problem"], "code">,
  headers: Record<string, string> = {},
): Response {
  return HttpResponse.json(
    { type: "about:blank", title: "Error", status, ...body },
    {
      status,
      headers: { "content-type": "application/problem+json", ...headers },
    },
  ) as unknown as Response;
}

function renderForm(): QueryClient {
  const client = createQueryClient();
  render(
    <QueryClientProvider client={client}>
      <SignInForm />
    </QueryClientProvider>,
  );
  return client;
}

function fillEmail(value: string): void {
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value },
  });
}

function submit(): void {
  fireEvent.click(screen.getByRole("button", { name: /send sign-in link/i }));
}

describe("SignInForm", () => {
  beforeEach(() => {
    attempts = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends email and redirect_path and shows the confirmation without the address", async () => {
    server.use(postMagicLink(() => new HttpResponse(null, { status: 202 })));

    renderForm();
    fillEmail("nobody@example.com");
    submit();

    expect(
      await screen.findByRole("heading", { name: "Check your email" }),
    ).toBeInTheDocument();

    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toEqual({
      email: "nobody@example.com",
      redirect_path: "/",
    });

    expect(screen.queryByText("nobody@example.com")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "If that address has an account, a sign-in link is on its way.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The link expires in fifteen minutes and can be used once.",
      ),
    ).toBeInTheDocument();
  });

  it("sends one request for a rapid double click", async () => {
    server.use(postMagicLink(() => new HttpResponse(null, { status: 202 })));

    renderForm();
    fillEmail("nobody@example.com");
    const button = screen.getByRole("button", { name: /send sign-in link/i });
    fireEvent.click(button);
    fireEvent.click(button);

    await screen.findByRole("heading", { name: "Check your email" });
    expect(attempts).toHaveLength(1);
  });

  it("blocks submission with a UX error and sends nothing", async () => {
    server.use(postMagicLink(() => new HttpResponse(null, { status: 202 })));

    renderForm();
    fillEmail("not-an-email");
    submit();

    const input = screen.getByLabelText("Email address");
    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter a valid email address.");
    expect(attempts).toHaveLength(0);
  });

  it("shows a two-minute wait and no retry button for rate_limited with Retry-After", async () => {
    server.use(
      postMagicLink(() =>
        problem(
          429,
          { code: "rate_limited", title: "Too Many Requests" },
          { "Retry-After": "120" },
        ),
      ),
    );

    renderForm();
    fillEmail("nobody@example.com");
    submit();

    expect(
      await screen.findByText("Too many attempts. Try again in 2 minutes."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
    expect(attempts).toHaveLength(1);
  });

  it("shows the general rate_limited message without Retry-After", async () => {
    server.use(
      postMagicLink(() =>
        problem(429, { code: "rate_limited", title: "Too Many Requests" }),
      ),
    );

    renderForm();
    fillEmail("nobody@example.com");
    submit();

    expect(
      await screen.findByText("Too many attempts. Please try again later."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
    expect(attempts).toHaveLength(1);
  });

  it("places a validation_failed email entry at the field and an unknown field at form level", async () => {
    server.use(
      postMagicLink(() =>
        problem(400, {
          code: "validation_failed",
          title: "Bad Request",
          detail: "leaked-detail",
          errors: [
            { field: "email", message: "That address looks wrong." },
            { field: "mystery", message: "Unrecognised value." },
          ],
        }),
      ),
    );

    renderForm();
    fillEmail("nobody@example.com");
    submit();

    const input = screen.getByLabelText("Email address");
    await waitFor(() =>
      expect(input).toHaveAccessibleDescription("That address looks wrong."),
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Unrecognised value.")).toBeInTheDocument();

    expect(screen.queryByText("leaked-detail")).not.toBeInTheDocument();
    expect(screen.queryByText("Bad Request")).not.toBeInTheDocument();
    expect(attempts).toHaveLength(1);
  });

  it("shows the network notice and retries with the same address", async () => {
    server.use(
      postMagicLink(() => HttpResponse.error() as unknown as Response),
    );

    renderForm();
    fillEmail("nobody@example.com");
    submit();

    expect(
      await screen.findByText(
        "We could not reach the server. Check your connection and try again.",
      ),
    ).toBeInTheDocument();
    expect(attempts).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(attempts).toHaveLength(2));
    expect(attempts[1]).toEqual(attempts[0]);
  });

  it("returns to an empty form from the different-address button", async () => {
    server.use(postMagicLink(() => new HttpResponse(null, { status: 202 })));

    renderForm();
    fillEmail("nobody@example.com");
    submit();

    await screen.findByRole("heading", { name: "Check your email" });

    fireEvent.click(
      screen.getByRole("button", { name: "Use a different address" }),
    );

    const input = await screen.findByLabelText("Email address");
    expect(input).toHaveValue("");
  });

  it("disables the submit button while the request is in flight", async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      postMagicLink(async () => {
        await held;
        return new HttpResponse(null, { status: 202 });
      }),
    );

    renderForm();
    fillEmail("nobody@example.com");
    submit();

    const button = screen.getByRole("button", {
      name: /sending|send sign-in link/i,
    });
    await waitFor(() => expect(button).toBeDisabled());

    release?.();
    await screen.findByRole("heading", { name: "Check your email" });
  });
});
