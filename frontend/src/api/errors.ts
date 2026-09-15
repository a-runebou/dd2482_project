import type { components } from "./generated/schema";

type ErrorCode = components["schemas"]["ErrorCode"];
type Problem = components["schemas"]["Problem"];

/**
 * Exhaustive map of every error code, checked against the contract in both directions
 * by the compiler: a code the contract has but this map lacks is a "property missing"
 * error, and a code here that the contract lacks is an "unknown property" error. The
 * runtime list and set are derived from its keys, so the contract and the runtime guard
 * cannot drift apart, and no generator flag or unused binding is involved.
 */
const ERROR_CODE_MAP: Record<ErrorCode, true> = {
  validation_failed: true,
  unauthenticated: true,
  token_expired: true,
  forbidden: true,
  not_owner: true,
  not_found: true,
  group_not_found: true,
  group_not_confirmed: true,
  already_member: true,
  group_confirmed: true,
  member_limit_reached: true,
  group_limit_reached: true,
  proposal_limit_reached: true,
  calendar_source_limit_reached: true,
  idempotency_key_reuse: true,
  version_conflict: true,
  slot_not_in_window: true,
  range_too_long: true,
  ics_parse_failed: true,
  rate_limited: true,
  internal_error: true,
  ics_fetch_failed: true,
  db_circuit_open: true,
  service_unavailable: true,
};

export const ERROR_CODES = Object.keys(ERROR_CODE_MAP) as ErrorCode[];

const ERROR_CODE_SET = new Set<string>(ERROR_CODES);

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && ERROR_CODE_SET.has(value);
}

/**
 * The normalized failure a caller sees. Exactly three kinds. UI code switches on `code`
 * only for kind `problem`; a code outside `ErrorCode` is never cast, it is `unexpected`.
 */
export type ApiError =
  | {
      kind: "problem";
      status: number;
      code: ErrorCode;
      title: string;
      detail?: string;
      errors?: Problem["errors"];
      retryAfterSeconds?: number;
    }
  | { kind: "network" }
  | { kind: "unexpected"; status?: number };

// Register ApiError as TanStack Query's default error type, so useQuery's error and the
// retry function's error parameter are ApiError without any cast at the call sites.
declare module "@tanstack/react-query" {
  interface Register {
    defaultError: ApiError;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Retry-After in seconds, parsed as a non-negative integer. Undefined when the header is
 * absent (for example not exposed across origins by CORS) or is not an integer; the
 * contract types it as integer seconds, so the HTTP-date form is deliberately not accepted.
 */
export function parseRetryAfter(headers: Headers): number | undefined {
  const raw = headers.get("retry-after");
  if (raw === null || !/^\d+$/.test(raw)) {
    return undefined;
  }
  return Number(raw);
}

function parseFieldErrors(value: unknown): Problem["errors"] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const parsed = value.filter(
    (entry): entry is { field: string; message: string } =>
      isRecord(entry) &&
      typeof entry.field === "string" &&
      typeof entry.message === "string",
  );
  return parsed.length > 0 ? parsed : undefined;
}

/**
 * Turn a non-ok response and its already-parsed body into an ApiError. A `problem` is
 * produced only when the content type is application/problem+json, the body carries the
 * fields the Problem schema requires, and its code is a member of ErrorCode. Everything
 * else, including a non-problem JSON body, an unparsed (invalid JSON) body and an unknown
 * code, is `unexpected`.
 */
export function normalizeError(response: Response, body: unknown): ApiError {
  const status = response.status;
  const contentType = response.headers.get("content-type") ?? "";
  if (
    contentType.includes("application/problem+json") &&
    isRecord(body) &&
    typeof body.type === "string" &&
    typeof body.title === "string" &&
    typeof body.status === "number" &&
    isErrorCode(body.code)
  ) {
    return {
      kind: "problem",
      status,
      code: body.code,
      title: body.title,
      detail: typeof body.detail === "string" ? body.detail : undefined,
      errors: parseFieldErrors(body.errors),
      retryAfterSeconds: parseRetryAfter(response.headers),
    };
  }
  return { kind: "unexpected", status };
}

/**
 * Classify something a fetch threw rather than answered. A fetch that never produced a
 * response throws a TypeError, which is `network`; any other thrown value is `unexpected`,
 * so a genuine network failure and a client-side error are never conflated.
 */
export function normalizeThrown(thrown: unknown): ApiError {
  return thrown instanceof TypeError
    ? { kind: "network" }
    : { kind: "unexpected" };
}

/**
 * Return the data of an openapi-fetch result, or throw an ApiError so TanStack Query sees
 * a rejection.
 */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await call;
  } catch (thrown) {
    throw normalizeThrown(thrown);
  }
  const { data, error, response } = result;
  if (response.ok) {
    return data as T;
  }
  throw normalizeError(response, error);
}
