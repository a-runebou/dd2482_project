import { apiClient } from "./client";
import { unwrap } from "./errors";
import type { components } from "./generated/schema";

type User = components["schemas"]["User"];

export interface Session {
  accessToken: string;
  user: User;
}

/**
 * The whole session, in module scope and nowhere else. CLAUDE.md rule 10: the access token is
 * held in memory only: never in web storage, never in a cookie written by JavaScript, never in
 * a URL, the query cache or the log. A page reload therefore signs the user out until the boot
 * probe exchanges the HttpOnly refresh cookie for a new token.
 *
 * This module and client.ts import each other: the middleware needs refreshSession, and
 * refreshSession needs the typed client. Nothing here runs at module-evaluation time and
 * refreshSession is a hoisted function declaration, so the cycle resolves either way round.
 */
let current: Session | undefined;

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * The snapshot for useSyncExternalStore. The reference changes only when the session does, so
 * React does not re-render on every read.
 */
export function getSession(): Session | undefined {
  return current;
}

export function getAccessToken(): string | undefined {
  return current?.accessToken;
}

export function setSession(accessToken: string, user: User): void {
  current = { accessToken, user };
  notify();
}

export function clearSession(): void {
  current = undefined;
  notify();
}

export function subscribeToSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** One well-known name, so every tab of this origin contends for the same lock. */
const REFRESH_LOCK = "schedular-auth-refresh";

let inFlight: Promise<string | undefined> | undefined;

/**
 * Exchange the HttpOnly refresh cookie for a new access token, returning the token or
 * undefined. A failure is not an error the caller has to handle: the store is cleared and the
 * user is signed out.
 *
 * Rotation with reuse detection means two simultaneous refreshes would revoke the whole token
 * family, so the call is serialised twice over (item C3 of docs/coordination/frontend-backend.md,
 * which also buys a 30-second grace window on the backend): concurrent callers in this tab share
 * one in-flight promise, and tabs contend for a Web Lock where the browser has one.
 */
export async function refreshSession(): Promise<string | undefined> {
  inFlight ??= withRefreshLock(performRefresh).finally(() => {
    inFlight = undefined;
  });
  return await inFlight;
}

async function withRefreshLock(
  run: () => Promise<string | undefined>,
): Promise<string | undefined> {
  // Feature detection, not a type assertion: Safari and older browsers have no LockManager, and
  // lib.dom types navigator.locks as always present.
  const locks: LockManager | undefined = globalThis.navigator.locks;
  if (locks === undefined) {
    return await run();
  }
  return await locks.request(REFRESH_LOCK, run);
}

async function performRefresh(): Promise<string | undefined> {
  try {
    const session = await unwrap(apiClient.POST("/auth/refresh"));
    setSession(session.access_token, session.user);
    return session.access_token;
  } catch {
    clearSession();
    return undefined;
  }
}
