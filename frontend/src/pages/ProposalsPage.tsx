import { useParams } from "react-router";
import { ProposalsBoard } from "../features/scheduling/ProposalsBoard";
import { PageContainer } from "../components/PageContainer";
import { NotFoundPage } from "./NotFoundPage";

/**
 * The route component for /groups/:slug/proposals. It reads the parameter and does nothing else;
 * a path with no slug cannot match this route, so the guard only makes that a type rather than
 * an assumption, as on the group detail and availability routes.
 */
export function ProposalsPage() {
  const { slug } = useParams();

  if (slug === undefined) {
    return <NotFoundPage />;
  }

  return (
    <PageContainer>
      <ProposalsBoard slug={slug} />
    </PageContainer>
  );
}
