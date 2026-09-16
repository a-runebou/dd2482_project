import { Link } from "react-router";
import { PageContainer } from "../components/PageContainer";
import { PageHeading } from "../components/PageHeading";
import { LINK } from "../components/cx";

export function NotFoundPage() {
  return (
    <PageContainer className="text-center">
      <PageHeading
        title="Page not found"
        description="The page you were looking for does not exist."
      />
      <Link className={`mt-6 inline-block ${LINK}`} to="/">
        Return to the home page
      </Link>
    </PageContainer>
  );
}
