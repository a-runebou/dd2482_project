import type { ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ApiErrorNotice } from "../../components/ApiErrorNotice";
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
      <p role="status" className="mt-4">
        Loading your groups…
      </p>
    );
  }

  // isPending is false with data still undefined only when the first fetch itself failed: show
  // only the notice, never a stale or empty list underneath it.
  if (query.data === undefined) {
    if (query.error) {
      return (
        <ApiErrorNotice
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
          isRetrying={query.isFetching}
        />
      );
    }
    return null;
  }

  const groups = query.data.pages.flatMap((page) => page.data);

  if (groups.length === 0) {
    return <p className="mt-4">You are not in any groups yet.</p>;
  }

  // Data exists, so the list always renders. A failed page fetch or a failed background refetch
  // is shown below it, never in place of it.
  let notice: ReactNode = null;
  if (query.isFetchNextPageError && query.error) {
    notice = (
      <ApiErrorNotice
        error={query.error}
        retry={() => {
          void query.fetchNextPage();
        }}
        isRetrying={query.isFetchingNextPage}
      />
    );
  } else if (query.isRefetchError && query.error) {
    notice = (
      <ApiErrorNotice
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
        isRetrying={query.isFetching}
      />
    );
  }

  return (
    <div className="mt-4">
      <ul>
        {groups.map((group) => (
          <li key={group.slug} className="border-b py-3">
            <p className="font-semibold">{group.name}</p>
            <p>{formatDateRange(group.date_start, group.date_end)}</p>
            <p>{STATE_LABELS[group.state]}</p>
            {group.my_role && <p>{ROLE_LABELS[group.my_role]}</p>}
            <p>{memberCountLabel(group.member_count)}</p>
          </li>
        ))}
      </ul>
      {notice}
      {query.hasNextPage && !notice && (
        <button
          type="button"
          className="mt-4 rounded border px-4 py-2 disabled:opacity-50"
          disabled={query.isFetchingNextPage}
          onClick={() => {
            void query.fetchNextPage();
          }}
        >
          Load more
        </button>
      )}
    </div>
  );
}
