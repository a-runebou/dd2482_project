import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker } from "react-router";
import { ApiErrorNotice } from "../../components/ApiErrorNotice";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { GroupNav } from "../../components/GroupNav";
import { PageHeading } from "../../components/PageHeading";
import { Spinner } from "../../components/Spinner";
import { LINK } from "../../components/cx";
import type { ApiError } from "../../api/errors";
import type { components } from "../../api/generated/schema";
import { randomUuidV4 } from "../../lib/uuid";
import {
  addMinutes,
  buildSlotGrid,
  generateSlots,
  normalizeInstant,
  slotDate,
  slotLabel,
} from "../../lib/slots";
import { useConfig } from "../../api/config";
import { groupQueryOptions } from "../groups/groupQueries";
import {
  availabilityMatrixQueryOptions,
  busyQueryOptions,
  myAvailabilityQueryOptions,
} from "./availabilityQueries";
import { putMyAvailabilityMutationOptions } from "./availabilityMutations";
import {
  CONFIRMED_MESSAGE,
  FROZEN_WHILE_EDITING_MESSAGE,
  OTHERS_CHANGED_MESSAGE,
  RECONCILED_MESSAGE,
  STALE_POLL_MESSAGE,
  STALE_SLOTS_MESSAGE,
  describeAvailabilityError,
  orphanedSelectionMessage,
} from "./availabilityErrors";
import {
  EMPTY_SELECTION,
  applyState,
  busySlots,
  cellState,
  detailFor,
  indexMatrix,
  orphanedSlots,
  selectionFromPayload,
  selectionsEqual,
  toSelectionBody,
  type CellState,
  type Selection,
} from "./availabilityModel";
import { describeSlot } from "./slotDescription";
import { SlotGrid } from "./SlotGrid";
import { AvailabilityLegend } from "./AvailabilityLegend";

type AvailabilityMatrix = components["schemas"]["AvailabilityMatrix"];
type AvailabilitySelection = components["schemas"]["AvailabilitySelection"];

function NotFoundPanel() {
  return (
    <div>
      <PageHeading
        title="Group not found"
        description="This group does not exist, or you are not a member of it."
      />
      <Link to="/groups" className={`mt-4 inline-block ${LINK}`}>
        Your groups
      </Link>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="mt-4 rounded-md border border-neutral-200 bg-white p-3 text-sm text-neutral-600"
    >
      {children}
    </p>
  );
}

/**
 * The availability grid for one group.
 *
 * The read and the write are deliberately asymmetric (ARCHITECTURE 7.3): the matrix arrives as a
 * slot vector plus indices into it, and the write sends plain instants. Nothing here ever sends
 * an index, and nothing ever sends a local wall-clock time.
 *
 * Slots are generated locally only to lay the grid out and to compare against what the server
 * sent. Where the two disagree the server wins and the disagreement is said out loud, because a
 * silent difference between the browser's idea of the window and the server's is exactly the bug
 * the daylight-saving change produces.
 *
 * The selection lives in component state and reaches the server only when Save is pressed, so a
 * failed request — a 503 db_circuit_open in particular — leaves the work on screen
 * (ARCHITECTURE section 9).
 */
export function AvailabilityBoard({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const configQuery = useConfig();

  const saveMutation = useMutation(
    putMyAvailabilityMutationOptions(queryClient, slug),
  );

  // The grid polls the matrix with If-None-Match while it is on screen (ARCHITECTURE 6.3), at
  // the interval the server recommends; the number is never written here (CLAUDE.md rule 7).
  // `refetchIntervalInBackground: false` is what stops the polling when the document is hidden,
  // and the same focus manager refetches once when it becomes visible again.
  //
  // The interval is switched off entirely while a save is in flight, so that a poll cannot
  // overlap the write, and so that the refetch the write's invalidation triggers is the only
  // one that follows a save: turning the interval back on restarts its timer from zero.
  const pollSeconds = configQuery.data?.poll_interval_seconds;
  const pollInterval: number | false =
    pollSeconds === undefined || saveMutation.isPending
      ? false
      : pollSeconds * 1000;

  // The group is polled alongside the matrix, on the same interval and through the same
  // conditional read, because its `state` is where the freeze comes from: a confirmation made
  // on another screen, or by the owner in another tab, has to reach a grid that is already
  // open. A poll that finds nothing changed costs a header exchange, as the matrix's does.
  const groupQuery = useQuery({
    ...groupQueryOptions(slug),
    refetchInterval: pollInterval,
    refetchIntervalInBackground: false,
  });
  const group = groupQuery.data?.group;

  // The slots this browser works out for the group, used for the busy window and for the
  // comparison in step 9. Generated per local day, so the 25 October 2026 change is right.
  const generated = useMemo(
    () =>
      group === undefined
        ? []
        : generateSlots(
            group.date_start,
            group.date_end,
            group.window_start_minute,
            group.window_end_minute,
            group.slot_minutes,
            group.timezone,
          ),
    [group],
  );

  const busyRange = useMemo(() => {
    const first = generated[0];
    const last = generated.at(-1);
    if (first === undefined || last === undefined || group === undefined) {
      return undefined;
    }
    return { from: first, to: addMinutes(last, group.slot_minutes) };
  }, [generated, group]);

  const matrixQuery = useQuery({
    ...availabilityMatrixQueryOptions(slug),
    refetchInterval: pollInterval,
    refetchIntervalInBackground: false,
  });
  const myQuery = useQuery(myAvailabilityQueryOptions(slug));
  const busyQuery = useQuery(busyQueryOptions(busyRange));
  const matrix = matrixQuery.data?.data;

  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [baseline, setBaseline] = useState<Selection>(EMPTY_SELECTION);
  const [seeded, setSeeded] = useState<AvailabilitySelection | undefined>(
    undefined,
  );
  const [inspected, setInspected] = useState<string | undefined>(undefined);
  const [seenMatrix, setSeenMatrix] = useState<AvailabilityMatrix | undefined>(
    undefined,
  );
  const [othersChanged, setOthersChanged] = useState(false);
  const [confirmedByServer, setConfirmedByServer] = useState(false);

  const isDirty = !selectionsEqual(selection, baseline);

  // Adjusting state while rendering, rather than in an effect, so the grid never paints one
  // frame of an empty selection over a stored one. A refetch after a save arrives as a new
  // object and reseeds both the selection and the baseline, which is what makes Save go quiet.
  //
  // A read that lands while there are unsaved changes is deliberately not applied: a poll, a
  // refetch on becoming visible again, or another tab's save must never overwrite work in
  // progress. It is not marked as seeded either, so it seeds as soon as there is nothing to
  // lose — after a save, or after Discard changes.
  const stored = myQuery.data;
  if (stored !== undefined && stored !== seeded && !isDirty) {
    const next = selectionFromPayload(stored);
    setSeeded(stored);
    setBaseline(next);
    setSelection(next);
  }

  // Someone else's answer arriving mid-edit changes the heatmap under the user's hands, so it
  // is said out loud rather than left to be noticed. The flag clears itself once there is
  // nothing unsaved, which is what a save or a discard does.
  if (matrix !== undefined && matrix !== seenMatrix) {
    setSeenMatrix(matrix);
    if (isDirty) {
      setOthersChanged(true);
    }
  }
  if (othersChanged && !isDirty) {
    setOthersChanged(false);
  }

  const idempotency = useRef<{ body: string; key: string } | undefined>(
    undefined,
  );
  // The button is disabled while a save is in flight, but the flag that disables it is set by a
  // state update that a second click can beat. This ref cannot be beaten, so a double click is
  // one request rather than two identical ones racing each other.
  const saving = useRef(false);

  const saveOutcome =
    saveMutation.error === null
      ? undefined
      : describeAvailabilityError(saveMutation.error);
  const readOnly = group?.state === "confirmed" || confirmedByServer;

  if (saveOutcome?.kind === "confirmed" && !confirmedByServer) {
    setConfirmedByServer(true);
  }

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty &&
      !readOnly &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  // The server's vector is authoritative for rendering; the generated one is only ever compared
  // against it. `slots` is therefore the server's, normalized so two spellings compare equal.
  const serverSlots = useMemo(
    () => (matrix?.slots ?? []).map(normalizeInstant),
    [matrix],
  );
  const reconciled = useMemo(() => {
    if (matrix === undefined || generated.length === 0) {
      return true;
    }
    return (
      serverSlots.length === generated.length &&
      serverSlots.every((slot, index) => slot === generated[index])
    );
  }, [matrix, generated, serverSlots]);

  const gridModel = useMemo(
    () =>
      group === undefined
        ? { columns: [], rowLabels: [] }
        : buildSlotGrid(serverSlots, group.timezone),
    [serverSlots, group],
  );
  const details = useMemo(
    () => (matrix === undefined ? new Map() : indexMatrix(matrix)),
    [matrix],
  );

  // Slots the user has marked that the server has since stopped offering. They stay in the
  // selection; all that happens is that they are named, because the grid can only draw cells
  // that are in the vector it renders.
  const orphanedLabels = useMemo(() => {
    if (matrix === undefined || group === undefined) {
      return [];
    }
    return orphanedSlots(selection, serverSlots).map(
      (instant) =>
        `${slotDate(instant, group.timezone)} ${slotLabel(instant, group.timezone)}`,
    );
  }, [matrix, group, selection, serverSlots]);

  // A poll that failed leaves the last known matrix on screen and says only that it may be
  // stale. The query client has already retried a network failure by the time this is true,
  // so a single dropped request never reaches the user.
  const pollFailed = matrixQuery.isError && matrix !== undefined;
  const busy = useMemo(
    () =>
      group === undefined
        ? new Set<string>()
        : busySlots(
            serverSlots,
            busyQuery.data?.data ?? [],
            group.slot_minutes,
          ),
    [serverSlots, busyQuery.data, group],
  );

  if (groupQuery.isPending) {
    return (
      <div>
        <GroupNav slug={slug} groupName={undefined} current="availability" />
        <p
          role="status"
          className="mt-6 flex items-center gap-2 text-neutral-600"
        >
          <Spinner />
          Loading the group…
        </p>
      </div>
    );
  }

  if (
    group === undefined &&
    groupQuery.error !== null &&
    describeAvailabilityError(groupQuery.error).kind === "not-found"
  ) {
    return <NotFoundPanel />;
  }

  if (group === undefined) {
    return (
      <div>
        <GroupNav slug={slug} groupName={undefined} current="availability" />
        <div className="mt-6">
          <ApiErrorNotice
            error={groupQuery.error as ApiError}
            retry={() => void groupQuery.refetch()}
            isRetrying={groupQuery.isFetching}
          />
        </div>
      </div>
    );
  }

  function apply(instants: readonly string[], state: CellState): void {
    setSelection((current) => applyState(current, instants, state));
  }

  function save(): void {
    if (saving.current) {
      return;
    }
    saving.current = true;
    const body = toSelectionBody(selection);
    const serialized = JSON.stringify(body);
    if (idempotency.current?.body !== serialized) {
      idempotency.current = { body: serialized, key: randomUuidV4() };
    }
    saveMutation.mutate(
      { body, idempotencyKey: idempotency.current.key },
      {
        // The write's own response is the new baseline, not the refetch it triggers: a refetch
        // can fail or arrive late, and either way what was stored is what the server echoed.
        // `seeded` is deliberately left pointing at the read this grid was built from, so the
        // stale copy still in the cache cannot seed over the save on the very next render.
        onSuccess: (data: AvailabilitySelection) => {
          const saved = selectionFromPayload(data);
          setBaseline(saved);
          setSelection(saved);
        },
        onSettled: () => {
          saving.current = false;
        },
      },
    );
  }

  const inspectedText =
    inspected === undefined
      ? "Point at or focus a slot to see who can make it."
      : describeSlot(
          slotDate(inspected, group.timezone),
          slotLabel(inspected, group.timezone),
          detailFor(details, inspected),
          { own: cellState(selection, inspected), busy: busy.has(inspected) },
        );

  return (
    <div>
      <GroupNav slug={slug} groupName={group.name} current="availability" />
      <PageHeading title="Availability" description={group.name} />

      {readOnly && (
        <Notice>
          {isDirty ? FROZEN_WHILE_EDITING_MESSAGE : CONFIRMED_MESSAGE}
        </Notice>
      )}
      {!reconciled && <Notice>{RECONCILED_MESSAGE}</Notice>}
      {othersChanged && <Notice>{OTHERS_CHANGED_MESSAGE}</Notice>}
      {orphanedLabels.length > 0 && (
        <Notice>{orphanedSelectionMessage(orphanedLabels)}</Notice>
      )}
      {pollFailed && <Notice>{STALE_POLL_MESSAGE}</Notice>}

      {matrixQuery.isPending ? (
        <p
          role="status"
          className="mt-6 flex items-center gap-2 text-neutral-600"
        >
          <Spinner />
          Loading the grid…
        </p>
      ) : matrix === undefined ? (
        <div className="mt-6">
          <ApiErrorNotice
            error={matrixQuery.error as ApiError}
            retry={() => void matrixQuery.refetch()}
            isRetrying={matrixQuery.isFetching}
          />
        </div>
      ) : (
        <>
          <AvailabilityLegend busyShown={busy.size > 0} />
          <SlotGrid
            model={gridModel}
            selection={selection}
            details={details}
            busy={busy}
            // A save in flight freezes the cells too, not just the buttons: the body being
            // written is the selection as it was when Save was pressed, and editing underneath
            // it would leave the screen claiming something the server was never told.
            readOnly={readOnly || saveMutation.isPending}
            onApply={apply}
            onInspect={setInspected}
          />
          <section
            aria-label="Slot details"
            className="mt-3 min-h-10 text-sm text-neutral-600"
          >
            <p>{inspectedText}</p>
          </section>
        </>
      )}

      {!readOnly && matrix !== undefined && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={!isDirty || saveMutation.isPending}
            onClick={save}
          >
            {saveMutation.isPending && <Spinner />}
            {saveMutation.isPending ? "Saving…" : "Save availability"}
          </Button>
          <Button
            disabled={!isDirty || saveMutation.isPending}
            onClick={() => setSelection(baseline)}
          >
            Discard changes
          </Button>
          {saveMutation.isSuccess && !isDirty && (
            <p role="status" className="text-sm text-neutral-600">
              Availability saved.
            </p>
          )}
        </div>
      )}

      {saveOutcome?.kind === "stale-slots" && (
        <Card className="mt-4 space-y-3 border-danger">
          <p className="text-danger">{STALE_SLOTS_MESSAGE}</p>
          <Button
            onClick={() => {
              saveMutation.reset();
              void matrixQuery.refetch();
            }}
          >
            Reload the grid
          </Button>
        </Card>
      )}

      {saveOutcome?.kind === "notice" && saveMutation.error !== null && (
        <div className="mt-4">
          <ApiErrorNotice
            error={saveMutation.error}
            retry={save}
            isRetrying={saveMutation.isPending}
          />
        </div>
      )}

      {blocker.state === "blocked" && (
        <Card className="mt-4 space-y-3">
          <p>
            You have unsaved changes to your availability. Leaving now discards
            them.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => blocker.reset()}>
              Stay on this page
            </Button>
            <Button onClick={() => blocker.proceed()}>
              Leave without saving
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
