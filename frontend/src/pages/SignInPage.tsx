import { SignInForm } from "../features/auth/SignInForm";
import { PageContainer } from "../components/PageContainer";
import { PageHeading } from "../components/PageHeading";

export function SignInPage() {
  return (
    <PageContainer>
      <PageHeading title="Sign in" />
      <SignInForm />
    </PageContainer>
  );
}
