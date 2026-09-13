import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ApiErrorNotice } from "../../components/ApiErrorNotice";
import { Card } from "../../components/Card";
import { PageHeading } from "../../components/PageHeading";
import { Spinner } from "../../components/Spinner";
import { LINK } from "../../components/cx";
import type { ApiError } from "../../api/errors";
import type { components } from "../../api/generated/schema";
import { formatDateRange } from "../../lib/date";
import { groupQueryOptions, membersQueryOptions } from "./groupQueries";
import { clockLabel } from "./windowOptions";
import { MembersPanel } from "./MembersPanel";
import { RenameGroupForm } from "./RenameGroupForm";
import { RotateInviteAction } from "./RotateInviteAction";
import { DeleteGroupAction } from "./DeleteGroupAction";
import { LeaveGroupAction } from "./LeaveGroupAction";

type Group = components["schemas"]["Group"];

const STATE_LABELS: Record<Group["state"], string> = {
  open: "Open",
  confirmed: "Confirmed",
  archived: "Archived",
};

function memberCountLabel(count: number): string {
  return `${count} ${count === 1 ? "member" : "members"}`;
}

/** A non-member gets 404 group_not_found, so this reveals nothing about whether a group exists. */
function isNotFound(error: ApiError): boolean {
  return (
    error.kind === "problem" &&
    (error.code === "group_not_found" || error.code === "not_found")
  );
}

function Summary({ group }: { group: Group }) {
  const rows: { term: string; value: string }[] = [
    { term: "Dates", value: formatDateRange(group.date_start, group.date_end) },
    {
      term: "Daily window",
      value: `${clockLabel(group.window_start_minute)} to ${clockLabel(group.window_end_minute)}`,
    },
    { term: "Timezone", value: group.timezone },
    { term: "State", value: STATE_LABELS[group.state] },
    { term: "Members", value: memberCountLabel(group.member_count) },
  ];

  return (
    <Card className="mt-6">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
        {rows.map((row) => (
          <div key={row.term} className="sm:contents">
            <dt className="text-sm font-semibold text-neutral-600">
              {row.term}
            </dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/**
 * The group and its members are two queries, so a failure in one leaves the other rendered
 * (frontend DECISIONS F21). The one exception is a not-found group: the whole screen becomes
 * the not-found panel, because a roster beside "Group not found" would say more than the
 * backend's deliberate 404 is willing to.
 */
export function GroupDetail({ slug }: { slug: string }) {
  // Both queries are started here, before any branch returns, so the roster is on its way
  // while the group is still loading and a failure in one cannot delay the other.
  const groupQuery = useQuery(groupQueryOptions(slug));
  const membersQuery = useQuery(membersQueryOptions(slug));
  const read = groupQuery.data;

  if (groupQuery.isPending) {
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

  if (read === undefined && groupQuery.error && isNotFound(groupQuery.error)) {
    return (
      <div className="mt-6">
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

  const group = read?.group;
  const role = group?.my_role;

  return (
    <div>
      {group === undefined ? (
        groupQuery.error && (
          <div className="mt-6">
            <ApiErrorNotice
              error={groupQuery.error}
              retry={() => {
                void groupQuery.refetch();
              }}
              isRetrying={groupQuery.isFetching}
            />
          </div>
        )
      ) : (
        <>
          <PageHeading title={group.name} />
          {group.description !== undefined && group.description !== null && (
            <p className="mt-2 text-neutral-600">{group.description}</p>
          )}
          <Summary group={group} />
          {/* Every member answers the grid, so this is not gated on the owner role. */}
          <Link
            to={`/groups/${slug}/availability`}
            className={`mt-4 inline-block ${LINK}`}
          >
            Open the availability grid
          </Link>
        </>
      )}

      {group !== undefined && role === "owner" && (
        <Card className="mt-6 space-y-5">
          <h2 className="text-lg font-semibold">Owner actions</h2>
          <RenameGroupForm slug={slug} name={group.name} etag={read?.etag} />
          <RotateInviteAction slug={slug} name={group.name} etag={read?.etag} />
          <DeleteGroupAction slug={slug} name={group.name} />
        </Card>
      )}

      {group !== undefined && role === "member" && (
        <Card className="mt-6">
          <LeaveGroupAction slug={slug} name={group.name} />
        </Card>
      )}

      <MembersPanel
        slug={slug}
        query={membersQuery}
        canRemove={role === "owner"}
      />
    </div>
  );
}
