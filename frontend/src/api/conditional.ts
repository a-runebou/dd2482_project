import { normalizeError, normalizeThrown, type ApiError } from "./errors";

/**
 * Conditional reads live beside `unwrap` rather than inside it, and not in client middleware.
 *
 * `unwrap` promises one thing — the body, or a thrown ApiError — and a conditional read has a
 * third answer, "unchanged", that cannot be squeezed into that signature without making every
 * existing caller handle an outcome it never asked for. Middleware was the other candidate and
 * is worse: it would have to guess which requests are conditional, and the ETag of a 200 would
 * have to leave through a side channel because openapi-fetch hands the caller a parsed body,
 * not the response. Here the caller says "here is my validator, send this" and is handed back
 * either fresh data with its new validator or the word "unchanged", and never touches a raw
 * Response itself.
 *
 * The validator is opaque bytes from the server, kept in the query cache beside the body it
 * validated (frontend DECISIONS F21) and therefore in memory only; it is never written to any
 * storage API, and it is never rebuilt from a `version` field, because the contract defines no
 * derivation for it.
 */

/** What one conditional GET produced: a fresh body with its validator, or "unchanged". */
export type ConditionalOutcome<T> =
  | { kind: "modified"; data: T; etag: string | undefined }
  | { kind: "not-modified" };

/** A body together with the validator that produced it, which is what a query caches. */
export interface CachedRead<T> {
  data: T;
  etag: string | undefined;
}

/** The shape of one openapi-fetch call, narrowed to what a read needs. */
type FetchResult<T> = { data?: T; error?: unknown; response: Response };

/** The request headers a conditional read adds, which is none at all without a validator. */
function conditionalHeaders(etag: string | undefined): Record<string, string> {
  return etag === undefined ? {} : { "If-None-Match": etag };
}

/**
 * Send one conditional GET. `send` receives the headers to merge into the request, so the
 * caller keeps ownership of the path and its parameters and the header spelling stays here.
 *
 * A 304 is an outcome, not a failure: it is checked before `response.ok`, which is false for
 * it, so it can never be classified as `unexpected`. Everything else behaves exactly as
 * `unwrap` does.
 */
export async function conditionalRead<T>(
  etag: string | undefined,
  send: (headers: Record<string, string>) => Promise<FetchResult<T>>,
): Promise<ConditionalOutcome<T>> {
  let result: FetchResult<T>;
  try {
    result = await send(conditionalHeaders(etag));
  } catch (thrown) {
    throw normalizeThrown(thrown);
  }
  const { data, error, response } = result;
  if (response.status === 304) {
    return { kind: "not-modified" };
  }
  if (!response.ok) {
    throw normalizeError(response, error);
  }
  return {
    kind: "modified",
    data: data as T,
    etag: response.headers.get("etag") ?? undefined,
  };
}

/**
 * A conditional read in the form a query function wants: the previous cached read in, the
 * next one out.
 *
 * On a 304 the *identical* previous object is returned rather than a copy, so TanStack Query
 * sees no new reference, nothing derived from it recomputes and nothing on screen moves — a
 * poll that found no change costs one request and no render.
 *
 * A 304 with nothing cached would mean the server answered a condition that was never sent;
 * there is no body to fall back on, so it is `unexpected` rather than an empty matrix.
 */
export async function cachedConditionalRead<T>(
  previous: CachedRead<T> | undefined,
  send: (headers: Record<string, string>) => Promise<FetchResult<T>>,
): Promise<CachedRead<T>> {
  const outcome = await conditionalRead(previous?.etag, send);
  if (outcome.kind === "modified") {
    return { data: outcome.data, etag: outcome.etag };
  }
  if (previous === undefined) {
    const error: ApiError = { kind: "unexpected", status: 304 };
    throw error;
  }
  return previous;
}
