import { useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Field } from "../../components/Field";
import { TextInput } from "../../components/TextInput";
import { LINK } from "../../components/cx";

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
    <div className="mt-6">
      <Card>
        <h2 className="text-lg font-semibold">Group created</h2>
        <p className="mt-2 font-semibold">{groupName}</p>

        <div className="mt-5">
          <Field label="Invite link">
            {(control) => (
              <TextInput
                ref={inputRef}
                type="text"
                readOnly
                value={inviteUrl}
                className="font-mono text-sm"
                {...control}
              />
            )}
          </Field>
        </div>

        <p className="mt-2 text-sm text-neutral-600">
          This link is shown only now. Copy it before you leave this page. As
          the owner you can generate a new one later, which invalidates this
          one.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Button
            variant="primary"
            onClick={() => {
              void copy();
            }}
          >
            Copy
          </Button>
          <Link to="/groups" className={LINK}>
            Your groups
          </Link>
        </div>

        <p role="status" className="mt-3 text-sm text-neutral-600">
          {copyState === "copied" && "Copied"}
          {copyState === "manual" && MANUAL_COPY_MESSAGE}
        </p>
      </Card>
    </div>
  );
}
