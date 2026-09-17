import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/Spinner";
import { LINK } from "../../components/cx";
import { useSession } from "./useSession";
import { signOutMutationOptions } from "./signOut";

/**
 * Who is signed in, and the way out. Rendered by the application header; it observes the module-level
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
      <Link className={LINK} to="/sign-in">
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link className={LINK} to="/calendar-sources">
        Calendars
      </Link>
      <p className="text-sm text-neutral-600">{session.user.display_name}</p>
      <Button
        variant="quiet"
        disabled={signOut.isPending}
        onClick={() => {
          signOut.mutate();
        }}
      >
        {signOut.isPending && <Spinner />}
        {signOut.isPending ? "Signing out…" : "Sign out"}
      </Button>
    </div>
  );
}
