import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { createQueryClient } from "../api/queryClient";
import { CreateGroupPage } from "./CreateGroupPage";

describe("CreateGroupPage", () => {
  it("renders the heading and composes the create-group form", async () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <CreateGroupPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Create a group" }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText("Group name")).toBeInTheDocument();
  });
});
