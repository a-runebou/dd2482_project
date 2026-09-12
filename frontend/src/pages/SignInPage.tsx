import { SignInForm } from "../features/auth/SignInForm";

export function SignInPage() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-bold">Sign in</h1>
      <SignInForm />
    </main>
  );
}
