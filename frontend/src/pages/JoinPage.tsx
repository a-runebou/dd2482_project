import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { ApiErrorNotice } from "../components/ApiErrorNotice";
import { PageContainer } from "../components/PageContainer";
import { PageHeading } from "../components/PageHeading";
import { Spinner } from "../components/Spinner";
import { SignInForm } from "../features/auth/SignInForm";
import { joinGroupMutationOptions } from "../features/groups/joinGroup";
import { useSession } from "../features/auth/useSession";

export const PENDING_INVITE_TOKEN_KEY = "schedular:pending-invite-token";

function isValidInviteToken(token: string | null): token is string {
  return token !== null && token.length >= 16 && token.length <= 64;
}

function pendingInviteToken(): string | null {
  const token = sessionStorage.getItem(PENDING_INVITE_TOKEN_KEY);
  return isValidInviteToken(token) ? token : null;
}

export function JoinPage({ redirectPath }: { redirectPath?: string }) {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const session = useSession();
  const queryToken = searchParams.get("invite");
  const inviteToken = isValidInviteToken(queryToken)
    ? queryToken
    : queryToken === null
      ? pendingInviteToken()
      : null;
  const mutation = useMutation(joinGroupMutationOptions(slug ?? ""));
  const startedToken = useRef<string | null>(null);

  useEffect(() => {
    if (isValidInviteToken(queryToken)) {
      sessionStorage.setItem(PENDING_INVITE_TOKEN_KEY, queryToken);
    }
  }, [queryToken]);

  useEffect(() => {
    if (
      session === undefined ||
      slug === undefined ||
      inviteToken === null ||
      startedToken.current === inviteToken
    ) {
      return;
    }

    startedToken.current = inviteToken;
    mutation.mutate(inviteToken, {
      onSuccess: () => {
        sessionStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
        void navigate(`/groups/${slug}`, { replace: true });
      },
      onError: (error) => {
        if (error.kind === "problem" && error.code === "already_member") {
          sessionStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
          void navigate(`/groups/${slug}`, { replace: true });
        }
      },
    });
  }, [inviteToken, mutation, navigate, queryToken, session, slug]);

  if (slug === undefined || inviteToken === null) {
    return (
      <PageContainer>
        <PageHeading title="Join group" />
        <p className="mt-4 text-neutral-600">
          This invite link is missing or invalid.
        </p>
      </PageContainer>
    );
  }

  if (session === undefined) {
    return (
      <PageContainer>
        <PageHeading title="Join group" />
        <p className="mt-4 text-neutral-600">Sign in to join this group.</p>
        <SignInForm redirectPath={redirectPath ?? `/join/${slug}`} />
      </PageContainer>
    );
  }

  if (mutation.isError) {
    return (
      <PageContainer>
        <PageHeading title="Join group" />
        <div className="mt-6">
          <ApiErrorNotice
            error={mutation.error}
            retry={() => {
              startedToken.current = null;
              mutation.reset();
            }}
            isRetrying={mutation.isPending}
          />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer role="status" className="text-center">
      <p className="flex items-center justify-center gap-2 text-neutral-600">
        <Spinner />
        Joining group…
      </p>
    </PageContainer>
  );
}
