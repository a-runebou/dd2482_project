import type { ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ApiErrorNotice } from "../../components/ApiErrorNotice";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { LINK } from "../../components/cx";
import { formatDateRange } from "../../lib/date";
import { groupsInfiniteQueryOptions } from "./queries";
import type { components } from "../../api/generated/schema";

type Group = components["schemas"]["Group"];

const STATE_LABELS: Record<Group["state"], string> = {
  open: "Open",
  confirmed: "Confirmed",
  archived: "Archived",
};

const ROLE_LABELS: Record<NonNullable<Group["my_role"]>, string> = {
  owner: "Owner",
  member: "Member",
};

function memberCountLabel(count: number): string {
  return `${count} ${count === 1 ? "member" : "members"}`;
}

export function GroupsList() {
  const query = useInfiniteQuery(groupsInfiniteQueryOptions);

  if (query.isPending) {
    return (
      <p
        role="status"
        className="mt-6 flex items-center gap-2 text-neutral-600"
      >
        <Spinner />
        Loading your groups…
      </p>
    );
  }

  // isPending is false with data still undefined only when the first fetch itself failed: show
  // only the notice, never a stale or empty list underneath it.
  if (query.data === undefined) {
    if (query.error) {
      return (
        <div className="mt-6">
          <ApiErrorNotice
            error={query.error}
            retry={() => {
              void query.refetch();
            }}
            isRetrying={query.isFetching}
          />
        </div>
      );
    }
    return null;
  }

  const groups = query.data.pages.flatMap((page) => page.data);

  // Data exists, so the list (or the empty state) always renders. A failed page fetch or a
  // failed background refetch is shown below it, never in place of it.
  let notice: ReactNode = null;
  if (query.isFetchNextPageError && query.error) {
    notice = (
      <div className="mt-6">
        <ApiErrorNotice
          error={query.error}
          retry={() => {
            void query.fetchNextPage();
          }}
          isRetrying={query.isFetchingNextPage}
        />
      </div>
    );
  } else if (query.isRefetchError && query.error) {
    notice = (
      <div className="mt-6">
        <ApiErrorNotice
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
          isRetrying={query.isFetching}
        />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="mt-6">
        <Card className="text-center">
          <p className="text-neutral-600">You are not in any groups yet.</p>
          <Link to="/groups/new" className={`mt-3 inline-block ${LINK}`}>
            Create a group
          </Link>
        </Card>
        {notice}
      </div>
    );
  }

  return (
    <div className="mt-6">
      <ul className="space-y-3">
        {groups.map((group) => (
          <li key={group.slug}>
            <Card>
              <p className="font-semibold">
                <Link to={`/groups/${group.slug}`} className={LINK}>
                  {group.name}
                </Link>
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                {formatDateRange(group.date_start, group.date_end)}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-neutral-600">
                <p>{STATE_LABELS[group.state]}</p>
                {group.my_role && <p>{ROLE_LABELS[group.my_role]}</p>}
                <p>{memberCountLabel(group.member_count)}</p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {notice}
      {query.hasNextPage && !notice && (
        <Button
          className="mt-6"
          disabled={query.isFetchingNextPage}
          onClick={() => {
            void query.fetchNextPage();
          }}
        >
          {query.isFetchingNextPage && <Spinner />}
          Load more
        </Button>
      )}
    </div>
  );
}
