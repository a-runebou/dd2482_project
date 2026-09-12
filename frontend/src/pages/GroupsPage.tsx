import { Link } from "react-router";
import { GroupsList } from "../features/groups/GroupsList";

export function GroupsPage() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-bold">Your groups</h1>
      <Link to="/groups/new" className="mt-2 inline-block underline">
        Create a group
      </Link>
      <GroupsList />
    </main>
  );
}
