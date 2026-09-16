import { apiClient } from "../../api/client";
import { unwrap } from "../../api/errors";

/**
 * Downloading the confirmed event as an iCalendar file.
 *
 * The request has to carry the bearer token, so it cannot be a plain link: an anchor pointing
 * at the endpoint would be an unauthenticated navigation and the backend would refuse it. It is
 * fetched instead and handed to the browser afterwards.
 *
 * It goes through the typed client rather than a bare `fetch`, with `parseAs: "blob"`. The
 * response is `text/calendar` rather than JSON, which `unwrap` alone would be no use for, but
 * `parseAs` is exactly the knob openapi-fetch provides for that — and going through the client
 * keeps the one thing a bare fetch would lose, the session middleware that attaches the token
 * and performs the single refresh-and-retry on `token_expired` (frontend DECISIONS F18). A
 * failure is still a normal `ApiError`, because a problem document is still JSON and `unwrap`
 * reads the error body the same way.
 */
export async function fetchEventIcs(slug: string): Promise<Blob> {
  return await unwrap<Blob>(
    apiClient.GET("/groups/{slug}/event.ics", {
      params: { path: { slug } },
      parseAs: "blob",
    }),
  );
}

const MAX_STEM_LENGTH = 60;

/**
 * A filename derived from the group's name. Everything outside a-z, 0-9 becomes a hyphen, so
 * nothing a path or a shell would read specially survives: no separators, no quotes, no leading
 * dot. A name made entirely of such characters leaves nothing, which is what the fallback is
 * for.
 */
export function eventFilename(groupName: string): string {
  const stem = groupName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_STEM_LENGTH)
    .replace(/-+$/, "");
  return `${stem === "" ? "event" : stem}.ics`;
}

/**
 * Hand a blob to the browser as a download.
 *
 * The object URL is revoked, because it otherwise pins the blob in memory for the lifetime of
 * the document. It is revoked from a timeout rather than on the next line: the download the
 * click starts reads the URL, and revoking it in the same task has been known to cancel the
 * download in some browsers. A task later is after the click has been dispatched and long
 * before anything a user could do next.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
