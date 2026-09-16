import type { ReactNode } from "react";
import { Link } from "react-router";
import { LINK } from "./cx";

export type GroupNavPage = "detail" | "availability" | "proposals";

const SUB_PAGE_LABEL: Record<"availability" | "proposals", string> = {
  availability: "Availability",
  proposals: "Proposals",
};

/**
 * Stands in for the group's name while the group read is still pending, so the breadcrumb
 * occupies the same line height and the name does not pop in a moment after the rest of the
 * crumb trail. No new colour: `bg-neutral-200` is the same wash `CONTROL` already uses.
 */
function NameSkeleton() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-[1em] w-24 align-middle rounded-sm bg-neutral-200"
    />
  );
}

function Crumb({
  to,
  isCurrent,
  children,
}: {
  to: string;
  isCurrent: boolean;
  children: ReactNode;
}) {
  if (isCurrent) {
    return (
      <span aria-current="page" className="font-semibold text-neutral-900">
        {children}
      </span>
    );
  }
  return (
    <Link to={to} className={LINK}>
      {children}
    </Link>
  );
}

function Separator() {
  return (
    <li aria-hidden="true" className="text-neutral-500">
      /
    </li>
  );
}

interface GroupNavProps {
  slug: string;
  /** The group's name, or undefined while the group read is still pending. */
  groupName: string | undefined;
  current: GroupNavPage;
}

/**
 * The one breadcrumb shared by the group detail, availability and proposals routes: a way back
 * to the groups list, a way back up to the group from a sub-route (which is also where the group
 * name is said, since a sub-route otherwise never names the group it is in), and, on the two
 * sibling sub-routes, a link across to the other rather than a detour back through the detail
 * page. The current page is marked with `aria-current="page"` rather than a link, which is what
 * lets a screen reader announce it without the page adding an accent colour to a closed palette
 * (F20).
 */
export function GroupNav({ slug, groupName, current }: GroupNavProps) {
  return (
    <nav aria-label="Group" className="mt-2 text-sm">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <li>
          <Link to="/groups" className={LINK}>
            Your groups
          </Link>
        </li>
        <Separator />
        <li>
          <Crumb to={`/groups/${slug}`} isCurrent={current === "detail"}>
            {groupName ?? <NameSkeleton />}
          </Crumb>
        </li>
        {current !== "detail" && (
          <>
            <Separator />
            <li>
              <Crumb
                to={`/groups/${slug}/availability`}
                isCurrent={current === "availability"}
              >
                {SUB_PAGE_LABEL.availability}
              </Crumb>
            </li>
            <Separator />
            <li>
              <Crumb
                to={`/groups/${slug}/proposals`}
                isCurrent={current === "proposals"}
              >
                {SUB_PAGE_LABEL.proposals}
              </Crumb>
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}
