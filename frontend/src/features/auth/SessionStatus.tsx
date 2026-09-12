import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { useSession } from "./useSession";
import { signOutMutationOptions } from "./signOut";

/**
 * Who is signed in, and the way out. Rendered by the home page; it observes the module-level
 * session store, so it reflects a sign-in or a sign-out from anywhere without prop plumbing.
 * Only the display name is shown, never the token or the e-mail address.
 */
export function SessionStatus() {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const signOut = useMutation({
    ...signOutMutationOptions(queryClient),
    // Settled, not success: the store is cleared either way, so the user must not be left
    // looking at a page that still claims they are signed in.
    onSettled: () => {
      void navigate("/", { replace: true });
    },
  });

  if (session === undefined) {
    return (
      <Link className="mt-4 block underline" to="/sign-in">
        Sign in
      </Link>
    );
  }

  return (
    <div className="mt-4 flex items-center gap-4">
      <p>{session.user.display_name}</p>
      <button
        type="button"
        className="rounded border px-4 py-2 disabled:opacity-50"
        disabled={signOut.isPending}
        onClick={() => {
          signOut.mutate();
        }}
      >
        {signOut.isPending ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
