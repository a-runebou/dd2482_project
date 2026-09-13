import { Link } from "react-router";
import { PageContainer } from "../components/PageContainer";
import { PageHeading } from "../components/PageHeading";
import { LINK } from "../components/cx";

/**
 * The root route's errorElement. It deliberately renders a generic message and never the
 * caught error's message or stack, so an unexpected failure cannot leak internal detail to
 * the user. The thrown value from useRouteError is intentionally not read.
 */
export function RootErrorBoundary() {
  return (
    <PageContainer role="alert" className="text-center">
      <PageHeading
        title="Something went wrong"
        description="An unexpected error occurred. Please try returning to the home page."
      />
      <Link className={`mt-6 inline-block ${LINK}`} to="/">
        Return to the home page
      </Link>
    </PageContainer>
  );
}
