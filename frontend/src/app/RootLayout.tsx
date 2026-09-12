import { Outlet } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { configQueryOptions } from "../api/config";
import { sessionProbeQueryOptions } from "../features/auth/sessionProbe";
import { BootFailure } from "./BootFailure";

/**
 * The boot gate. Routes render only once GET /config has succeeded (ARCHITECTURE section 8;
 * CLAUDE.md rule 7). It uses the shared configQueryOptions, never a second /config query, and
 * the single useQuery result drives both the failure state and its retry.
 *
 * The session probe gates the same moment, so a reload restores the session before anything
 * reads it and the chrome never flickers from signed out to signed in. It cannot fail: being
 * signed out is one of its two normal outcomes, so it adds no failure state here.
 */
export function RootLayout() {
  const query = useQuery(configQueryOptions);
  const probe = useQuery(sessionProbeQueryOptions);

  if (query.isSuccess && probe.isSuccess) {
    return <Outlet />;
  }

  // isError stays true while a retry is in flight, so the failure state remains visible and
  // the retry button stays disabled rather than flashing back to the loading state.
  if (query.isError) {
    return (
      <BootFailure
        error={query.error}
        errorUpdatedAt={query.errorUpdatedAt}
        isFetching={query.fetchStatus === "fetching"}
        refetch={() => {
          void query.refetch();
        }}
      />
    );
  }

  return (
    <main role="status" className="mx-auto max-w-md p-6 text-center">
      <p>Loading…</p>
    </main>
  );
}
