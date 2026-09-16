import { useParams } from "react-router";
import { AvailabilityBoard } from "../features/availability/AvailabilityBoard";
import { PageContainer } from "../components/PageContainer";
import { NotFoundPage } from "./NotFoundPage";

/**
 * The route component for /groups/:slug/availability. It reads the parameter and does nothing
 * else; a path with no slug cannot match this route, so the guard only makes that a type rather
 * than an assumption, as on the group detail route.
 */
export function AvailabilityPage() {
  const { slug } = useParams();

  if (slug === undefined) {
    return <NotFoundPage />;
  }

  return (
    <PageContainer>
      <AvailabilityBoard slug={slug} />
    </PageContainer>
  );
}
