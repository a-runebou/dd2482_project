import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { createQueryClient } from "../api/queryClient";
import { SignInPage } from "./SignInPage";

describe("SignInPage", () => {
  it("renders a Sign in heading without a session", async () => {
    const client = createQueryClient();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <SignInPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText("Email address")).toBeInTheDocument();
  });
});
