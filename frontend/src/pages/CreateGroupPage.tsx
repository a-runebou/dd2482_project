import { CreateGroupForm } from "../features/groups/CreateGroupForm";
import { PageContainer } from "../components/PageContainer";
import { PageHeading } from "../components/PageHeading";

export function CreateGroupPage() {
  return (
    <PageContainer>
      <PageHeading title="Create a group" />
      <CreateGroupForm />
    </PageContainer>
  );
}
