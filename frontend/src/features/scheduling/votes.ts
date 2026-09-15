import type { components } from "../../api/generated/schema";

type VoteValue = components["schemas"]["VoteValue"];

/** The three values, in the order they are offered and tallied. */
export const VOTE_VALUES: readonly VoteValue[] = ["yes", "maybe", "no"];

export const VOTE_LABELS: Record<VoteValue, string> = {
  yes: "Yes",
  maybe: "Maybe",
  no: "No",
};

/** What an empty row says. A count of zero with no names beside it reads as a missing answer. */
export const NOBODY_YET = "nobody yet";

export const NOT_VOTED_LABEL = "Not voted yet";
