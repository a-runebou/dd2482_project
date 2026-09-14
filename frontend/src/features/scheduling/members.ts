import type { components } from "../../api/generated/schema";

type MemberPage = components["schemas"]["MemberPage"];

/** Display names by user id. A suggestion carries ids; only the roster knows what to call them. */
export type MemberIndex = ReadonlyMap<string, string>;

export const EMPTY_MEMBER_INDEX: MemberIndex = new Map();

/**
 * What an id with no matching member is called. A raw uuid on screen is both unreadable and a
 * small disclosure, and the roster can legitimately lag a suggestion by one poll: a member who
 * left after the suggestion was computed is still in it.
 */
export const UNKNOWN_MEMBER = "an unknown member";

export function buildMemberIndex(page: MemberPage | undefined): MemberIndex {
  return new Map(
    (page?.data ?? []).map((member) => [member.user_id, member.display_name]),
  );
}

export function memberName(index: MemberIndex, userId: string): string {
  return index.get(userId) ?? UNKNOWN_MEMBER;
}

/** A list of names as a sentence fragment: "Grace Hopper, Alan Turing and an unknown member". */
export function memberNames(
  index: MemberIndex,
  userIds: readonly string[],
): string {
  const names = userIds.map((userId) => memberName(index, userId));
  if (names.length <= 1) {
    return names[0] ?? "";
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
