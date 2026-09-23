import type { components } from "../../api/generated/schema";
import { memberNames, type MemberIndex } from "./members";
import { NOBODY_YET, NOT_VOTED_LABEL, VOTE_LABELS, VOTE_VALUES } from "./votes";

type Proposal = components["schemas"]["Proposal"];

/**
 * Who voted which way, and who has not voted at all.
 *
 * The ids a proposal carries mean nothing on their own, so every one of them is resolved
 * through the roster; an id the roster does not know renders as an unknown member rather than
 * as a raw uuid, because a member who voted and then left is a legitimate state and a uuid on
 * screen is both unreadable and a small disclosure (frontend DECISIONS F24).
 *
 * The members who have not voted are derived by subtraction rather than asked for, because the
 * contract has no such field: it is the roster minus everyone in the three arrays.
 */
export function VoteTally({
  votes,
  members,
}: {
  votes: Proposal["votes"];
  members: MemberIndex;
}) {
  const voted = new Set([...votes.yes, ...votes.maybe, ...votes.no]);
  const silent = [...members.keys()].filter((userId) => !voted.has(userId));

  const rows: { label: string; userIds: readonly string[] }[] = [
    ...VOTE_VALUES.map((value) => ({
      label: VOTE_LABELS[value],
      userIds: votes[value],
    })),
    { label: NOT_VOTED_LABEL, userIds: silent },
  ];

  return (
    <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
      {rows.map((row) => (
        <div key={row.label} className="sm:contents">
          <dt className="font-semibold text-neutral-600">
            {`${row.label} (${row.userIds.length})`}
          </dt>
          <dd>
            {row.userIds.length === 0
              ? NOBODY_YET
              : memberNames(members, row.userIds)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
