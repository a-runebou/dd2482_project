import { Link } from "react-router";
import { GroupsList } from "../features/groups/GroupsList";
import { PageContainer } from "../components/PageContainer";
import { PageHeading } from "../components/PageHeading";
import { LINK } from "../components/cx";

export function GroupsPage() {
  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <PageHeading title="Your groups" />
        <Link to="/groups/new" className={`mt-1 ${LINK}`}>
          Create a group
        </Link>
      </div>
      <GroupsList />
    </PageContainer>
  );
}
