import { useParams } from "react-router";
import { GroupDetail } from "../features/groups/GroupDetail";
import { PageContainer } from "../components/PageContainer";
import { NotFoundPage } from "./NotFoundPage";

/**
 * The route component for /groups/:slug. It reads the parameter and does nothing else; a path
 * with no slug cannot match this route, so the guard is only what makes that a type rather
 * than an assumption.
 */
export function GroupDetailPage() {
  const { slug } = useParams();

  if (slug === undefined) {
    return <NotFoundPage />;
  }

  return (
    <PageContainer>
      <GroupDetail slug={slug} />
    </PageContainer>
  );
}
