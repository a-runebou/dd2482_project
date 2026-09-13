import { Link, Outlet } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { configQueryOptions } from "../api/config";
import { sessionProbeQueryOptions } from "../features/auth/sessionProbe";
import { SessionStatus } from "../features/auth/SessionStatus";
import { PageContainer } from "../components/PageContainer";
import { Spinner } from "../components/Spinner";
import { FOCUS } from "../components/cx";
import { BootFailure } from "./BootFailure";

/**
 * The one application header. It is inside the success branch of the boot gate, so the boot
 * states stay full-page and chrome-free. The product name is a link rather than a heading,
 * because each page keeps its own h1.
 */
function AppHeader() {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link to="/" className={`rounded-sm text-base font-semibold ${FOCUS}`}>
          Schedular
        </Link>
        <SessionStatus />
      </div>
    </header>
  );
}

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
    return (
      <>
        <AppHeader />
        <Outlet />
      </>
    );
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
    <PageContainer role="status" className="text-center">
      <p className="flex items-center justify-center gap-2 text-neutral-600">
        <Spinner />
        Loading…
      </p>
    </PageContainer>
  );
}
