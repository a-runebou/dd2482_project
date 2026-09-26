import { Link } from "react-router";
import { PageContainer } from "../components/PageContainer";
import { PageHeading } from "../components/PageHeading";
import { LINK } from "../components/cx";

export function HomePage() {
  return (
    <PageContainer>
      <PageHeading title="Schedular" />
      <Link className={`mt-6 inline-block ${LINK}`} to="/groups">
        Your groups!!!
      </Link>
    </PageContainer>
  );
}
