import { Card } from "../../components/Card";
import type { components } from "../../api/generated/schema";
import { durationMinutes, formatWindow } from "../../lib/instants";
import { EventDownloadButton } from "../export/EventDownloadButton";
import { FeedLinkPanel } from "../export/FeedLinkPanel";
import { durationLabel } from "./windows";

type Group = components["schemas"]["Group"];

export const CONFIRMED_HEADING = "Confirmed meeting";

/**
 * The confirmed window, prominently, with the two ways of taking it away: a downloaded file and
 * a subscribable feed.
 *
 * It renders nothing at all unless the group is confirmed *and* carries the proposal, which is
 * ARCHITECTURE invariant 5 read as a guard rather than assumed: `confirmed_proposal` is non-null
 * if and only if the state is confirmed, so a group that satisfies only half of that is a
 * server this screen declines to draw conclusions from.
 *
 * Every instant is rendered in the group's timezone and never in the browser's.
 */
export function ConfirmedEventPanel({ group }: { group: Group }) {
  const proposal = group.confirmed_proposal;
  if (
    group.state !== "confirmed" ||
    proposal === undefined ||
    proposal === null
  ) {
    return null;
  }

  return (
    <Card className="mt-6">
      <h2 className="text-lg font-semibold">{CONFIRMED_HEADING}</h2>
      <p className="mt-2 text-xl font-semibold">
        {formatWindow(proposal.start_at, proposal.end_at, group.timezone)}
      </p>
      <p className="mt-1 text-sm text-neutral-600">
        {durationLabel(durationMinutes(proposal.start_at, proposal.end_at))}
      </p>
      <p className="mt-1 text-sm text-neutral-600">
        Times are shown in {group.timezone}.
      </p>

      <EventDownloadButton slug={group.slug} groupName={group.name} />

      {group.feed_url !== undefined && group.feed_url !== null && (
        <FeedLinkPanel feedUrl={group.feed_url} />
      )}
    </Card>
  );
}
