import { resolveBaseUrl } from "../api/baseUrl";

/** The mocking flag is opt-in and exact: only the literal "enabled" turns the worker on. */
export function isMockingEnabled(flag: string | undefined): boolean {
  return flag === "enabled";
}

/**
 * Start the MSW browser worker, but only in a development build with mocking explicitly enabled.
 * import.meta.env.DEV is tested directly in the condition, before the dynamic import, so a
 * production build (where Vite inlines it as false) drops the whole branch and never bundles MSW.
 */
export async function enableMocking(): Promise<void> {
  if (!(
    import.meta.env.DEV && isMockingEnabled(import.meta.env.VITE_API_MOCKING)
  )) {
    return;
  }

  const baseUrl = resolveBaseUrl(
    import.meta.env.VITE_API_BASE_URL,
    globalThis.location.origin,
  );

  const { worker } = await import("../mocks/browser");
  await worker.start({
    onUnhandledRequest(request, print) {
      // Vite serves its own modules from this same origin, so most unhandled requests are dev
      // assets, not API calls. Warn only for requests under the API base URL; bypass the rest.
      if (request.url.startsWith(baseUrl)) {
        print.warning();
      }
    },
  });
}
