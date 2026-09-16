import { cx } from "../../components/cx";

const HEAT_SWATCHES: { level: number; label: string; className: string }[] = [
  { level: 0, label: "Nobody", className: "bg-white" },
  { level: 1, label: "A few", className: "bg-accent/15" },
  { level: 2, label: "Some", className: "bg-accent/35" },
  { level: 3, label: "Most", className: "bg-accent/60" },
  { level: 4, label: "Everyone", className: "bg-accent/85" },
];

const OWN_STATES: { label: string; glyph: string }[] = [
  { label: "Not selected", glyph: "" },
  { label: "Available", glyph: "●" },
  { label: "Preferred", glyph: "★" },
];

/**
 * What the shades and the markers mean. The heatmap is the proportion of members who have
 * responded and are free, with a preference counted twice; a member who has never responded is
 * not in the denominator at all.
 */
export function AvailabilityLegend({ busyShown }: { busyShown: boolean }) {
  return (
    <section
      aria-label="Legend"
      className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-xs text-neutral-600"
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold">How many are free</span>
        {HEAT_SWATCHES.map((swatch) => (
          <span key={swatch.level} className="flex items-center gap-1">
            <span
              aria-hidden="true"
              className={cx(
                "inline-block h-4 w-4 border border-neutral-200",
                swatch.className,
              )}
            />
            <span>{swatch.label}</span>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="font-semibold">Your answer</span>
        {OWN_STATES.map((state) => (
          <span key={state.label} className="flex items-center gap-1">
            <span
              aria-hidden="true"
              className={cx(
                "inline-flex h-4 w-4 items-center justify-center border border-neutral-200 text-accent",
                state.glyph === "" ? "" : "ring-2 ring-accent ring-inset",
              )}
            >
              {state.glyph}
            </span>
            <span>{state.label}</span>
          </span>
        ))}
      </div>
      {busyShown && (
        <div className="flex items-center gap-2">
          <span className="font-semibold">From your calendar</span>
          <span className="flex items-center gap-1">
            <span
              aria-hidden="true"
              className="inline-block h-4 w-4 border border-dashed border-neutral-500"
            />
            <span>Busy</span>
          </span>
        </div>
      )}
    </section>
  );
}
