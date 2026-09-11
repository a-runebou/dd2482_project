import { Link } from "react-router";

/**
 * The root route's errorElement. It deliberately renders a generic message and never the
 * caught error's message or stack, so an unexpected failure cannot leak internal detail to
 * the user. The thrown value from useRouteError is intentionally not read.
 */
export function RootErrorBoundary() {
  return (
    <main role="alert" className="mx-auto max-w-md p-6 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2">
        An unexpected error occurred. Please try returning to the home page.
      </p>
      <Link className="mt-4 inline-block underline" to="/">
        Return to the home page
      </Link>
    </main>
  );
}
