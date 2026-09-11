import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import App from "./App";
import { appRoutes } from "./app/routes";
import { createQueryClient } from "./api/queryClient";

describe("App", () => {
  it("renders the Schedular heading once config has booted", async () => {
    const queryClient = createQueryClient();
    const router = createMemoryRouter(appRoutes, { initialEntries: ["/"] });
    render(<App queryClient={queryClient} router={router} />);

    expect(
      await screen.findByRole("heading", { name: "Schedular" }),
    ).toBeInTheDocument();
  });
});
