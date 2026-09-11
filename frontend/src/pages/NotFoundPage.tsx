import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <main className="mx-auto max-w-md p-6 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2">The page you were looking for does not exist.</p>
      <Link className="mt-4 inline-block underline" to="/">
        Return to the home page
      </Link>
    </main>
  );
}
