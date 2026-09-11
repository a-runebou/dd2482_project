import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { server } from "../mocks/server";
import { mockUrl } from "../mocks/urls";
import { groupsPage1Fixture } from "../mocks/fixtures";
import { createQueryClient } from "../api/queryClient";
import { GroupsPage } from "./GroupsPage";

describe("GroupsPage", () => {
  it("renders the heading and composes the groups feature", async () => {
    let requestCount = 0;
    server.use(
      http.get(mockUrl("/groups"), () => {
        requestCount += 1;
        return HttpResponse.json(groupsPage1Fixture);
      }),
    );

    const client = createQueryClient();
    render(
      <QueryClientProvider client={client}>
        <GroupsPage />
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Your groups" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Algorithms study group"),
    ).toBeInTheDocument();
    expect(requestCount).toBe(1);
  });
});
