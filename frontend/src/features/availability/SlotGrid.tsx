import { useEffect, useId, useRef, useState } from "react";
import { cx, FOCUS } from "../../components/cx";
import type { SlotGrid as SlotGridModel } from "../../lib/slots";
import {
  cellState,
  detailFor,
  heatLevel,
  nextState,
  type CellState,
  type Selection,
  type SlotDetail,
} from "./availabilityModel";
import { describeSlot, formatDayShort } from "./slotDescription";

/**
 * Five shades of the one accent, by opacity rather than by five new colours, because the palette
 * is closed (frontend DECISIONS F20) and a raw hex in a component is a bug. Shade is never the
 * only carrier: every cell's description says the counts and the names in words.
 */
const HEAT_CLASSES = [
  "bg-white",
  "bg-accent/15",
  "bg-accent/35",
  "bg-accent/60",
  "bg-accent/85",
];

/** The marker for the caller's own state. A glyph, so the three states are not colour alone. */
const OWN_GLYPH: Record<CellState, string> = {
  unselected: "",
  available: "●",
  preferred: "★",
};

interface Position {
  row: number;
  col: number;
}

export interface SlotGridProps {
  model: SlotGridModel;
  selection: Selection;
  details: ReadonlyMap<string, SlotDetail>;
  busy: ReadonlySet<string>;
  /** True once the group is confirmed or a save has been refused for that reason. */
  readOnly: boolean;
  onApply: (instants: readonly string[], state: CellState) => void;
  /** The cell the pointer or the focus is on, for the detail panel beside the grid. */
  onInspect: (instant: string | undefined) => void;
}

/**
 * The grid itself: columns are local dates, rows are local times of day, one cell per slot.
 *
 * Keyboard navigation is a roving tabindex — exactly one cell is in the tab order and the arrow
 * keys move between them — rather than several hundred tab stops. Space and Enter are handled on
 * keydown and the default is prevented, so activation happens once and the browser does not also
 * synthesize a click.
 *
 * Pointer interaction is pointerdown plus pointerover and nothing else, for the same reason: a
 * real browser fires pointerdown and then click for one press, so handling both would cycle a
 * cell twice. A press decides the state the first cell is moving to and every cell the pointer
 * then crosses is set to that state, which makes a drag paint a region instead of cycling each
 * cell by however many times the pointer happened to pass over it. The release is watched on the
 * window, so letting go outside the grid ends the drag as cleanly as letting go inside it.
 */
export function SlotGrid({
  model,
  selection,
  details,
  busy,
  readOnly,
  onApply,
  onInspect,
}: SlotGridProps) {
  const gridId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Position>(() => firstSlot(model));
  const [dragState, setDragState] = useState<CellState | undefined>(undefined);

  useEffect(() => {
    if (dragState === undefined) {
      return;
    }
    const end = () => setDragState(undefined);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [dragState]);

  function slotAt({ row, col }: Position): string | undefined {
    return model.columns[col]?.slots[row];
  }

  function focusCell(position: Position): void {
    containerRef.current
      ?.querySelector<HTMLElement>(
        `[data-row="${position.row}"][data-col="${position.col}"]`,
      )
      ?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent, instant: string): void {
    const moves: Record<string, Position> = {
      ArrowRight: { row: active.row, col: active.col + 1 },
      ArrowLeft: { row: active.row, col: active.col - 1 },
      ArrowDown: { row: active.row + 1, col: active.col },
      ArrowUp: { row: active.row - 1, col: active.col },
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      // A short local day leaves empty positions; focus stays put rather than landing on one.
      if (slotAt(move) !== undefined) {
        setActive(move);
        focusCell(move);
      }
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (!readOnly) {
        onApply([instant], nextState(cellState(selection, instant)));
      }
    }
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <div
        ref={containerRef}
        role="grid"
        aria-label="Availability grid"
        aria-readonly={readOnly || undefined}
        className="grid w-max min-w-full text-xs select-none"
        style={{
          gridTemplateColumns: `auto repeat(${model.columns.length}, minmax(3.25rem, 1fr))`,
        }}
        onPointerLeave={() => onInspect(undefined)}
      >
        <div role="row" className="contents">
          <div
            role="columnheader"
            className="sticky left-0 z-10 bg-neutral-50 px-2 py-1 text-left font-semibold text-neutral-600"
          >
            Time
          </div>
          {model.columns.map((column) => (
            <div
              key={column.date}
              role="columnheader"
              className="px-1 py-1 text-center font-semibold text-neutral-600"
            >
              {formatDayShort(column.date)}
            </div>
          ))}
        </div>

        {model.rowLabels.map((label, row) => (
          <div key={`${label}-${row}`} role="row" className="contents">
            <div
              role="rowheader"
              className="sticky left-0 z-10 bg-neutral-50 px-2 py-1 text-right whitespace-nowrap text-neutral-600 tabular-nums"
            >
              {label}
            </div>
            {model.columns.map((column, col) => {
              const instant = column.slots[row];
              if (instant === undefined) {
                return (
                  <div
                    key={`${column.date}-${row}`}
                    role="gridcell"
                    aria-disabled="true"
                    aria-label="No slot"
                    className="border border-neutral-200 bg-neutral-50"
                  />
                );
              }

              const detail = detailFor(details, instant);
              const own = cellState(selection, instant);
              const level = heatLevel(
                detail.availableCount,
                detail.preferredCount,
                detail.respondedCount,
              );
              const isBusy = busy.has(instant);
              const descriptionId = `${gridId}-${instant}`;

              return (
                <button
                  key={instant}
                  type="button"
                  role="gridcell"
                  data-row={row}
                  data-col={col}
                  data-heat={level}
                  data-own={own}
                  data-busy={isBusy ? "true" : undefined}
                  disabled={readOnly}
                  tabIndex={active.row === row && active.col === col ? 0 : -1}
                  aria-selected={own !== "unselected"}
                  aria-label={`${formatDayShort(column.date)} at ${label}`}
                  aria-describedby={descriptionId}
                  className={cx(
                    "flex h-7 items-center justify-center border leading-none",
                    isBusy
                      ? "border-dashed border-neutral-500"
                      : "border-neutral-200",
                    HEAT_CLASSES[level],
                    own === "unselected" ? "" : "ring-2 ring-accent ring-inset",
                    level >= 3 ? "text-white" : "text-accent",
                    FOCUS,
                  )}
                  onFocus={() => {
                    setActive({ row, col });
                    onInspect(instant);
                  }}
                  onBlur={() => onInspect(undefined)}
                  onKeyDown={(event) => handleKeyDown(event, instant)}
                  onPointerDown={() => {
                    onInspect(instant);
                    if (readOnly) {
                      return;
                    }
                    const target = nextState(own);
                    setDragState(target);
                    onApply([instant], target);
                  }}
                  onPointerOver={() => {
                    onInspect(instant);
                    if (!readOnly && dragState !== undefined) {
                      onApply([instant], dragState);
                    }
                  }}
                >
                  <span aria-hidden="true">{OWN_GLYPH[own]}</span>
                  <span id={descriptionId} className="sr-only">
                    {describeSlot(column.date, label, detail, {
                      own,
                      busy: isBusy,
                    })}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The first position that holds a real slot, which is where the roving tabindex starts. */
function firstSlot(model: SlotGridModel): Position {
  for (let row = 0; row < model.rowLabels.length; row += 1) {
    for (let col = 0; col < model.columns.length; col += 1) {
      if (model.columns[col]?.slots[row] !== undefined) {
        return { row, col };
      }
    }
  }
  return { row: 0, col: 0 };
}
