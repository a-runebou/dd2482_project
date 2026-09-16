import { useRef, useState } from "react";
import { Button } from "../../components/Button";
import { Field } from "../../components/Field";
import { TextInput } from "../../components/TextInput";

export const FEED_NOTE =
  "Anyone with this link can subscribe to the group's calendar, so treat it like a password. The group's owner can rotate it, which stops the previous link working.";

const MANUAL_COPY_MESSAGE = "Press Ctrl+C or Cmd+C to copy the link.";

type CopyState = "idle" | "copied" | "manual";

/**
 * The subscribable calendar feed.
 *
 * The URL carries a token that is the whole of its authorization, because calendar clients
 * cannot present a bearer token (the contract says as much). It is therefore treated exactly as
 * the invite link is: it lives in this component's props and nowhere else — never in web
 * storage, never in a URL of ours, never in the query cache and never in the console.
 *
 * Copying follows the invite-link pattern for the same reason it does there: `navigator.
 * clipboard` exists only in a secure context and the development VM serves plain HTTP
 * (ARCHITECTURE R1), so a missing or rejecting clipboard is an expected path, not a failure.
 */
export function FeedLinkPanel({ feedUrl }: { feedUrl: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  async function copy(): Promise<void> {
    if (navigator.clipboard !== undefined) {
      try {
        await navigator.clipboard.writeText(feedUrl);
        setCopyState("copied");
        return;
      } catch {
        // A rejection here is a permissions or context problem, not something to report.
      }
    }
    inputRef.current?.select();
    setCopyState("manual");
  }

  return (
    <div className="mt-5">
      <Field label="Calendar feed link">
        {(control) => (
          <TextInput
            ref={inputRef}
            type="text"
            readOnly
            value={feedUrl}
            className="font-mono text-sm"
            {...control}
          />
        )}
      </Field>
      <p className="mt-2 text-sm text-neutral-600">{FEED_NOTE}</p>
      <div className="mt-3">
        <Button
          onClick={() => {
            void copy();
          }}
        >
          Copy
        </Button>
      </div>
      <p role="status" className="mt-2 text-sm text-neutral-600">
        {copyState === "copied" && "Copied"}
        {copyState === "manual" && MANUAL_COPY_MESSAGE}
      </p>
    </div>
  );
}
