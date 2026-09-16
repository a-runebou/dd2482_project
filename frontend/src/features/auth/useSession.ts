import { useSyncExternalStore } from "react";
import type { Session } from "../../api/session";
import { getSession, subscribeToSession } from "../../api/session";

/**
 * The current session, or undefined. The store is outside React, so components observe it with
 * useSyncExternalStore rather than duplicating it into state that could drift.
 */
export function useSession(): Session | undefined {
  return useSyncExternalStore(subscribeToSession, getSession);
}
