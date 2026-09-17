import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { ApiErrorNotice } from "../components/ApiErrorNotice";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageContainer } from "../components/PageContainer";
import { PageHeading } from "../components/PageHeading";
import { Spinner } from "../components/Spinner";
import { LINK } from "../components/cx";
import type { ApiError } from "../api/errors";
import {
  calendarSourcesQueryOptions,
  createCalendarSourceMutationOptions,
  deleteCalendarSourceMutationOptions,
  refreshCalendarSourceMutationOptions,
  uploadCalendarSourceMutationOptions,
} from "../features/calendar/calendarSources";

function errorMessage(error: ApiError): string | undefined {
  if (error.kind !== "problem") {
    return undefined;
  }
  switch (error.code) {
    case "calendar_source_limit_reached":
      return "You have reached the calendar source limit.";
    case "ics_parse_failed":
      return "That calendar file could not be parsed.";
    case "ics_fetch_failed":
      return "The calendar could not be fetched.";
    case "rate_limited":
      return error.retryAfterSeconds === undefined
        ? "Refresh is temporarily rate limited."
        : `Refresh is rate limited. Try again in ${Math.ceil(error.retryAfterSeconds / 60)} minutes.`;
    case "validation_failed":
      return "Check the calendar details and try again.";
    default:
      return undefined;
  }
}

function SourceError({
  error,
  retry,
  isRetrying,
}: {
  error: ApiError;
  retry: () => void;
  isRetrying: boolean;
}) {
  const message = errorMessage(error);
  return message === undefined ? (
    <ApiErrorNotice error={error} retry={retry} isRetrying={isRetrying} />
  ) : (
    <div role="alert" className="mt-3 text-sm text-danger">
      <p>{message}</p>
      {error.kind !== "problem" || error.code !== "rate_limited" ? (
        <Button className="mt-2" disabled={isRetrying} onClick={retry}>
          {isRetrying && <Spinner />}
          Retry
        </Button>
      ) : null}
    </div>
  );
}

function SourceStatus({ status, errorCode }: { status: string; errorCode?: string | null }) {
  if (status === "error") {
    return <p className="text-sm text-danger">Error{errorCode ? `: ${errorCode}` : ""}</p>;
  }
  return <p className="text-sm text-neutral-600">Status: {status}</p>;
}

export function CalendarSourcesPage() {
  const queryClient = useQueryClient();
  const query = useQuery(calendarSourcesQueryOptions);
  const create = useMutation(createCalendarSourceMutationOptions(queryClient));
  const upload = useMutation(uploadCalendarSourceMutationOptions(queryClient));
  const refresh = useMutation(refreshCalendarSourceMutationOptions(queryClient));
  const remove = useMutation(deleteCalendarSourceMutationOptions(queryClient));
  const fileInput = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");

  if (query.isPending) {
    return <PageContainer role="status" className="text-center"><Spinner /></PageContainer>;
  }
  if (query.isError) {
    return <PageContainer><PageHeading title="Calendar sources" /><div className="mt-6"><ApiErrorNotice error={query.error} retry={() => void query.refetch()} isRetrying={query.isFetching} /></div></PageContainer>;
  }

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <PageHeading title="Calendar sources" />
        <Link className={`mt-1 ${LINK}`} to="/groups">Back to groups</Link>
      </div>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold">Add a calendar URL</h2>
        <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); create.mutate({ url, ...(label === "" ? {} : { label }) }, { onSuccess: () => { setUrl(""); setLabel(""); } }); }}>
          <label className="block text-sm font-medium" htmlFor="calendar-url">Calendar URL</label>
          <input id="calendar-url" className="w-full rounded-md border border-neutral-400 px-3 py-2" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} />
          <label className="block text-sm font-medium" htmlFor="calendar-label">Label <span className="font-normal text-neutral-600">(optional)</span></label>
          <input id="calendar-label" className="w-full rounded-md border border-neutral-400 px-3 py-2" value={label} onChange={(event) => setLabel(event.target.value)} />
          <Button type="submit" variant="primary" disabled={create.isPending}>{create.isPending && <Spinner />}Add URL calendar</Button>
        </form>
        {create.error !== null && <SourceError error={create.error} retry={() => create.mutate({ url, ...(label === "" ? {} : { label }) })} isRetrying={create.isPending} />}
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold">Upload an .ics file</h2>
        <p className="mt-2 text-sm text-neutral-600">The server parses the file and imports its events.</p>
        <label className="mt-4 block text-sm font-medium" htmlFor="calendar-file">ICS file</label>
        <input id="calendar-file" ref={fileInput} className="mt-2 block w-full text-sm" type="file" accept=".ics,text/calendar" onChange={(event) => { const file = event.target.files?.[0]; if (file !== undefined) upload.mutate(file); }} />
        {upload.isPending && <p className="mt-3 flex items-center gap-2 text-sm text-neutral-600"><Spinner />Uploading…</p>}
        {upload.error !== null && <SourceError error={upload.error} retry={() => { const file = fileInput.current?.files?.[0]; if (file !== undefined) upload.mutate(file); }} isRetrying={upload.isPending} />}
      </Card>

      <section className="mt-8" aria-labelledby="existing-calendars-heading">
        <h2 id="existing-calendars-heading" className="text-xl font-semibold">Your calendars</h2>
        {query.data.data.length === 0 ? <p className="mt-3 text-neutral-600">No calendars imported yet.</p> : <div className="mt-4 space-y-3">{query.data.data.map((source) => <Card key={source.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="font-semibold">{source.label ?? (source.kind === "upload" ? "Uploaded calendar" : source.url ?? "Calendar")}</h3><SourceStatus status={source.status} errorCode={source.last_error_code} /><p className="mt-1 text-sm text-neutral-600">{source.event_count} events</p></div>
            <div className="flex flex-wrap gap-2"><Button disabled={refresh.isPending} onClick={() => refresh.mutate(source.id)}>{refresh.isPending && <Spinner />}Refresh</Button><Button disabled={remove.isPending} onClick={() => remove.mutate(source.id)}>Delete</Button></div>
          </div>
          {refresh.error !== null && <SourceError error={refresh.error} retry={() => refresh.mutate(source.id)} isRetrying={refresh.isPending} />}
          {remove.error !== null && <SourceError error={remove.error} retry={() => remove.mutate(source.id)} isRetrying={remove.isPending} />}
        </Card>)}</div>}
      </section>
    </PageContainer>
  );
}