import { Link } from "react-router";

export function HomePage() {
  return (
    <>
      <h1 className="text-3xl font-bold">Schedular</h1>
      <Link className="mt-4 inline-block underline" to="/groups">
        Your groups
      </Link>
      <Link className="mt-4 block underline" to="/sign-in">
        Sign in
      </Link>
    </>
  );
}
