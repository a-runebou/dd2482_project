import { useId, useRef, useState } from "react";
import { Link } from "react-router";

interface InviteLinkPanelProps {
  groupName: string;
  inviteUrl: string;
}

type CopyState = "idle" | "copied" | "manual";

const MANUAL_COPY_MESSAGE = "Press Ctrl+C or Cmd+C to copy the link.";

/**
 * The one-time invite link. It arrives only in the creation response (ARCHITECTURE 6.5), so it
 * lives in this component's props and nowhere else: not in web storage, not in the URL, not in
 * the query cache and not in the console.
 *
 * navigator.clipboard is exposed only in a secure context and the development VM serves plain
 * HTTP (ARCHITECTURE R1), so a missing or rejecting clipboard is the expected path, not an
 * error: the field's text is selected instead and the shortcut is spelled out.
 */
export function InviteLinkPanel({
  groupName,
  inviteUrl,
}: InviteLinkPanelProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  async function copy(): Promise<void> {
    if (navigator.clipboard !== undefined) {
      try {
        await navigator.clipboard.writeText(inviteUrl);
        setCopyState("copied");
        return;
      } catch {
        // Fall through to the manual path: a rejection here is a permissions or context
        // problem, not something the user can act on.
      }
    }
    inputRef.current?.select();
    setCopyState("manual");
  }

  return (
    <div className="mt-4">
      <h2 className="text-2xl font-bold">Group created</h2>
      <p className="mt-2 font-semibold">{groupName}</p>

      <label htmlFor={inputId} className="mt-4 block font-medium">
        Invite link
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="text"
        readOnly
        value={inviteUrl}
        className="mt-1 w-full rounded border px-3 py-2"
      />
      <p className="mt-2">
        This link is shown only now. Copy it before you leave this page. As the
        owner you can generate a new one later, which invalidates this one.
      </p>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          className="rounded border px-4 py-2"
          onClick={() => {
            void copy();
          }}
        >
          Copy
        </button>
        <Link to="/groups" className="underline">
          Your groups
        </Link>
      </div>

      <p role="status" className="mt-2">
        {copyState === "copied" && "Copied"}
        {copyState === "manual" && MANUAL_COPY_MESSAGE}
      </p>
    </div>
  );
}
