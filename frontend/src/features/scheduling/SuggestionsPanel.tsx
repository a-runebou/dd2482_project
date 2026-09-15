import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiErrorNotice } from "../../components/ApiErrorNotice";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Field } from "../../components/Field";
import { Select } from "../../components/Select";
import { Spinner } from "../../components/Spinner";
import type { components } from "../../api/generated/schema";
import { durationMinutes, formatWindow } from "../../lib/instants";
import { randomUuidV4 } from "../../lib/uuid";
import { memberNames, type MemberIndex } from "./members";
import { suggestionsQueryOptions } from "./schedulingQueries";
import { createProposalMutationOptions } from "./schedulingMutations";
import {
  CONFIRMED_MESSAGE,
  NOT_OWNER_MESSAGE,
  OUTSIDE_WINDOW_MESSAGE,
  describeSchedulingError,
  limitMessage,
  type SchedulingOutcome,
} from "./schedulingErrors";
import {
  DEFAULT_DURATION_MINUTES,
  DEFAULT_SUGGESTION_LIMIT,
  durationLabel,
  durationOptions,
  limitOptions,
  relativeFit,
} from "./windows";

type Config = components["schemas"]["Config"];
type Suggestion = components["schemas"]["Suggestion"];

interface SuggestionsPanelProps {
  slug: string;
  /** The group's IANA zone. Every instant below is read in it and never in the browser's. */
  timezone: string;
  members: MemberIndex;
  config: Config;
  /** Whether the reader may turn a suggestion into a proposal. */
  canPropose: boolean;
}

export const EMPTY_SUGGESTIONS_MESSAGE =
  "No window works for everyone yet. Try a shorter duration, or wait for more members to answer the availability grid.";

function availabilitySentence(suggestion: Suggestion): string {
  const available = suggestion.available_user_ids.length;
  const preferring = suggestion.preferred_user_ids.length;
  const noun = available === 1 ? "member" : "members";
  const verb = preferring === 1 ? "prefers" : "prefer";
  return `${available} ${noun} available, of whom ${preferring} ${verb} this window`;
}

/**
 * The sentence for a failed creation, or undefined when ApiErrorNotice already says it better.
 * Chosen by outcome alone, so no problem document's title, detail or status can reach the page.
 */
function createMessage(
  outcome: SchedulingOutcome,
  maxProposals: number,
): string | undefined {
  switch (outcome.kind) {
    case "not-owner":
      return NOT_OWNER_MESSAGE;
    case "confirmed":
      return CONFIRMED_MESSAGE;
    case "limit":
      return limitMessage(maxProposals);
    case "outside-window":
      return OUTSIDE_WINDOW_MESSAGE;
    default:
      return undefined;
  }
}

/**
 * A relative indication of fit, never the raw score.
 *
 * The contract says a score is comparable only within one response, so the number on its own is
 * not something a reader can act on. The best window in the response is the reference and every
 * other is stated as a proportion of it, in words as well as by the length of the bar: the bar
 * is decoration and the sentence beside it is what is actually read out.
 */
function Fit({ fraction, isBest }: { fraction: number; isBest: boolean }) {
  const percent = Math.round(fraction * 100);
  return (
    <p className="mt-1 flex items-center gap-2 text-sm text-neutral-600">
      <span aria-hidden="true" className="h-1.5 w-24 rounded-sm bg-neutral-200">
        <span
          className="block h-full rounded-sm bg-accent"
          style={{ width: `${percent}%` }}
        />
      </span>
      <span>{isBest ? "Best fit" : `${percent}% of the best fit`}</span>
    </p>
  );
}

/**
 * Ranked candidate windows for a chosen duration, and, for an owner, a way to turn one into a
 * proposal.
 *
 * The panel owns its own query and its own creation mutation, so a failure here never blanks
 * the proposals list beside it. Owner controls are withdrawn rather than shown and refused: the
 * group's role decides it, and a read that comes back `not_owner` withdraws them too instead of
 * putting an error where a control would have been.
 */
export function SuggestionsPanel({
  slug,
  timezone,
  members,
  config,
  canPropose,
}: SuggestionsPanelProps) {
  const queryClient = useQueryClient();
  const [duration, setDuration] = useState(DEFAULT_DURATION_MINUTES);
  const [limit, setLimit] = useState(DEFAULT_SUGGESTION_LIMIT);
  const query = useQuery(suggestionsQueryOptions(slug, duration, limit));
  const createMutation = useMutation(
    createProposalMutationOptions(queryClient, slug),
  );

  // One key per distinct body, as elsewhere: proposing the same window twice after a failure is
  // one request, and proposing a different window is a new one.
  const keys = useRef(new Map<string, string>());
  // The button is disabled while a creation is in flight, but a second click can beat the state
  // update that disables it; this ref cannot be beaten.
  const creating = useRef(false);

  const readOutcome =
    query.error === null ? undefined : describeSchedulingError(query.error);
  const createSentence =
    createMutation.error === null
      ? undefined
      : createMessage(
          describeSchedulingError(createMutation.error),
          config.max_proposals_per_group,
        );
  const mayPropose = canPropose && readOutcome?.kind !== "not-owner";

  const suggestions = query.data?.data ?? [];
  const best = suggestions[0]?.score ?? 0;

  function propose(suggestion: Suggestion): void {
    if (creating.current) {
      return;
    }
    creating.current = true;
    const body = {
      start_at: suggestion.start_at,
      end_at: suggestion.end_at,
      origin: "suggested" as const,
    };
    const serialized = JSON.stringify(body);
    let key = keys.current.get(serialized);
    if (key === undefined) {
      key = randomUuidV4();
      keys.current.set(serialized, key);
    }
    createMutation.mutate(
      { body, idempotencyKey: key },
      {
        onSettled: () => {
          creating.current = false;
        },
      },
    );
  }

  return (
    <section aria-labelledby="suggestions-heading" className="mt-8">
      <h2 id="suggestions-heading" className="text-lg font-semibold">
        Suggested windows
      </h2>
      <p className="mt-1 text-sm text-neutral-600">
        Worked out from everyone&rsquo;s availability each time this is opened,
        and shown in {timezone}.
      </p>

      <div className="mt-4 flex flex-wrap gap-4">
        <Field label="Duration to look for">
          {(control) => (
            <Select
              value={String(duration)}
              onChange={(event) => setDuration(Number(event.target.value))}
              {...control}
            >
              {durationOptions(
                config.slot_minutes,
                config.min_duration_minutes,
                config.max_duration_minutes,
              ).map((minutes) => (
                <option key={minutes} value={minutes}>
                  {durationLabel(minutes)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="How many to show">
          {(control) => (
            <Select
              value={String(limit)}
              onChange={(event) => setLimit(Number(event.target.value))}
              {...control}
            >
              {limitOptions().map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {query.isPending ? (
        <p
          role="status"
          className="mt-4 flex items-center gap-2 text-neutral-600"
        >
          <Spinner />
          Working out the best windows…
        </p>
      ) : query.data === undefined ? (
        readOutcome?.kind === "not-owner" ? null : (
          <div className="mt-4">
            <ApiErrorNotice
              error={query.error}
              retry={() => void query.refetch()}
              isRetrying={query.isFetching}
            />
          </div>
        )
      ) : suggestions.length === 0 ? (
        <p className="mt-4 text-neutral-600">{EMPTY_SUGGESTIONS_MESSAGE}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion.start_at}-${suggestion.end_at}`}>
              <Card>
                <p className="font-semibold">
                  {formatWindow(
                    suggestion.start_at,
                    suggestion.end_at,
                    timezone,
                  )}
                </p>
                <p className="mt-1 text-sm text-neutral-600">
                  {durationLabel(
                    durationMinutes(suggestion.start_at, suggestion.end_at),
                  )}
                </p>
                <Fit
                  fraction={relativeFit(suggestion.score, best)}
                  isBest={index === 0}
                />
                <p className="mt-2">{availabilitySentence(suggestion)}</p>
                <p className="mt-1 text-sm text-neutral-600">
                  {suggestion.missing_user_ids.length === 0
                    ? "Everyone can make it."
                    : `Missing: ${memberNames(members, suggestion.missing_user_ids)}.`}
                </p>
                {mayPropose && (
                  <Button
                    className="mt-3"
                    disabled={createMutation.isPending}
                    onClick={() => propose(suggestion)}
                  >
                    {createMutation.isPending && <Spinner />}
                    Propose this window
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {createMutation.error !== null && (
        <div className="mt-4">
          {createSentence === undefined ? (
            <ApiErrorNotice
              error={createMutation.error}
              retry={() => {
                createMutation.reset();
              }}
              isRetrying={createMutation.isPending}
            />
          ) : (
            <p role="alert" className="text-danger">
              {createSentence}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
