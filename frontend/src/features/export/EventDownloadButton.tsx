import { useMutation } from "@tanstack/react-query";
import { ApiErrorNotice } from "../../components/ApiErrorNotice";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/Spinner";
import { describeSchedulingError } from "../scheduling/schedulingErrors";
import { eventFilename, fetchEventIcs, saveBlob } from "./downloadEvent";

/** What `group_not_confirmed` means to a reader who asked for the file. */
export const NOT_CONFIRMED_MESSAGE =
  "This group is not confirmed yet, so there is no event to download.";

/**
 * The download, for any member of a confirmed group.
 *
 * A mutation rather than a query: it is an action with a side effect on the browser, it must
 * run only when asked, and nothing about it belongs in the cache — the file is handed straight
 * to the browser and never held.
 */
export function EventDownloadButton({
  slug,
  groupName,
}: {
  slug: string;
  groupName: string;
}) {
  const mutation = useMutation({
    mutationFn: () => fetchEventIcs(slug),
    onSuccess: (blob: Blob) => {
      saveBlob(blob, eventFilename(groupName));
    },
  });

  const outcome =
    mutation.error === null
      ? undefined
      : describeSchedulingError(mutation.error);

  return (
    <div className="mt-4">
      <Button
        variant="primary"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending && <Spinner />}
        {mutation.isPending ? "Preparing…" : "Download the calendar file"}
      </Button>

      {mutation.error !== null && (
        <div className="mt-3">
          {outcome?.kind === "not-confirmed" ? (
            <p role="alert" className="text-danger">
              {NOT_CONFIRMED_MESSAGE}
            </p>
          ) : (
            <ApiErrorNotice
              error={mutation.error}
              retry={() => mutation.mutate()}
              isRetrying={mutation.isPending}
            />
          )}
        </div>
      )}
    </div>
  );
}
