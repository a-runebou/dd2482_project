import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ApiErrorNotice } from "../../components/ApiErrorNotice";
import { PageHeading } from "../../components/PageHeading";
import { Spinner } from "../../components/Spinner";
import { LINK } from "../../components/cx";
import { useConfig } from "../../api/config";
import { groupQueryOptions, membersQueryOptions } from "../groups/groupQueries";
import { proposalsQueryOptions } from "./schedulingQueries";
import { buildMemberIndex } from "./members";
import { CONFIRMED_MESSAGE, describeSchedulingError } from "./schedulingErrors";
import { SuggestionsPanel } from "./SuggestionsPanel";
import { ManualProposalForm } from "./ManualProposalForm";
import { ProposalsList } from "./ProposalsList";

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

/**
 * Suggestions and proposals for one group.
 *
 * The group, its roster, the suggestions and the proposals are four queries, so one failing
 * leaves the others rendered (frontend DECISIONS F21): a suggestions request that fails never
 * blanks the proposals list, and the reverse holds too. The one exception is a group that is
 * not visible, where the whole screen becomes the not-found panel, because anything else would
 * disclose more than the backend's deliberate 404 is willing to (CLAUDE.md rule 8).
 *
 * Every instant below is rendered in `group.timezone` and never in the browser's; the roster is
 * what turns the user ids a suggestion carries into names.
 *
 * Owner-only controls are withdrawn rather than shown and refused, and a confirmed group
 * withdraws them too: the contract answers `group_confirmed` for any write to one, so offering
 * the control would be offering something that cannot succeed.
 */
export function ProposalsBoard({ slug }: { slug: string }) {
  const configQuery = useConfig();
  const groupQuery = useQuery(groupQueryOptions(slug));
  const membersQuery = useQuery(membersQueryOptions(slug));
  // The board owns the proposals read and hands it to the list. One observer, so one request:
  // it is needed here as well, because a read that comes back not_owner has to withdraw the
  // controls the list does not own, such as the manual form.
  const proposalsQuery = useQuery(proposalsQueryOptions(slug));

  const group = groupQuery.data?.group;
  const config = configQuery.data;
  const members = buildMemberIndex(membersQuery.data);

  if (groupQuery.isPending || configQuery.isPending) {
    return (
      <p
        role="status"
        className="mt-6 flex items-center gap-2 text-neutral-600"
      >
        <Spinner />
        Loading the group…
      </p>
    );
  }

  if (
    group === undefined &&
    groupQuery.error !== null &&
    describeSchedulingError(groupQuery.error).kind === "not-found"
  ) {
    return <NotFoundPanel />;
  }

  if (group === undefined || config === undefined) {
    const error = groupQuery.error ?? configQuery.error;
    return (
      <div className="mt-6">
        {error !== null && (
          <ApiErrorNotice
            error={error}
            retry={() => {
              void groupQuery.refetch();
              void configQuery.refetch();
            }}
            isRetrying={groupQuery.isFetching || configQuery.isFetching}
          />
        )}
      </div>
    );
  }

  const confirmed = group.state === "confirmed";
  const refusedOnLoad =
    proposalsQuery.error !== null &&
    describeSchedulingError(proposalsQuery.error).kind === "not-owner";
  const mayWrite = group.my_role === "owner" && !confirmed && !refusedOnLoad;
  // Voting is every member's, not the owner's, so it is gated on the group's state alone. The
  // freeze is derived from the group read on every render rather than latched on the first, so
  // a confirmation that arrives after this screen loaded withdraws the controls when it lands.
  const mayVote = !confirmed && !refusedOnLoad;

  return (
    <div>
      <PageHeading title="Proposals" description={group.name} />
      <Link to={`/groups/${slug}`} className={`mt-2 inline-block ${LINK}`}>
        Back to the group
      </Link>

      {confirmed && (
        <p
          role="status"
          className="mt-4 rounded-md border border-neutral-200 bg-white p-3 text-sm text-neutral-600"
        >
          {CONFIRMED_MESSAGE}
        </p>
      )}

      <SuggestionsPanel
        slug={slug}
        timezone={group.timezone}
        members={members}
        config={config}
        canPropose={mayWrite}
      />

      {mayWrite && <ManualProposalForm group={group} config={config} />}

      <ProposalsList
        slug={slug}
        timezone={group.timezone}
        query={proposalsQuery}
        members={members}
        canManage={mayWrite}
        canVote={mayVote}
        canConfirm={mayWrite}
        confirmedProposalId={group.confirmed_proposal?.id ?? null}
      />
    </div>
  );
}
