import { describe, it, expect } from "vitest";
import type { components } from "../../api/generated/schema";
import {
  applyState,
  busySlots,
  cellState,
  detailFor,
  EMPTY_SELECTION,
  heatLevel,
  indexMatrix,
  nextState,
  orphanedSlots,
  selectionFromPayload,
  selectionsEqual,
  toSelectionBody,
} from "./availabilityModel";

const A = "2026-10-05T06:00:00Z";
const B = "2026-10-05T06:30:00Z";
const C = "2026-10-05T07:00:00Z";

describe("cell state", () => {
  it("cycles unselected, available, preferred, unselected", () => {
    expect(nextState("unselected")).toBe("available");
    expect(nextState("available")).toBe("preferred");
    expect(nextState("preferred")).toBe("unselected");
  });

  it("reads a cell's state out of a selection", () => {
    const selection = applyState(EMPTY_SELECTION, [A], "preferred");
    expect(cellState(selection, A)).toBe("preferred");
    expect(cellState(selection, B)).toBe("unselected");
  });

  it("applies one state to a run of cells rather than cycling each", () => {
    const start = applyState(EMPTY_SELECTION, [B], "preferred");
    const painted = applyState(start, [A, B, C], "available");

    expect(cellState(painted, A)).toBe("available");
    expect(cellState(painted, B)).toBe("available");
    expect(cellState(painted, C)).toBe("available");
  });

  it("clears cells when the applied state is unselected", () => {
    const selection = applyState(EMPTY_SELECTION, [A, B], "available");
    expect(applyState(selection, [A, B], "unselected").size).toBe(0);
  });

  it("does not mutate the selection it was given", () => {
    const selection = applyState(EMPTY_SELECTION, [A], "available");
    applyState(selection, [B], "preferred");
    expect(selection.size).toBe(1);
  });
});

describe("selection payloads", () => {
  it("sends instants in two disjoint sorted arrays", () => {
    const selection = applyState(
      applyState(EMPTY_SELECTION, [C, A], "available"),
      [B],
      "preferred",
    );

    expect(toSelectionBody(selection)).toEqual({
      available: [A, C],
      preferred: [B],
    });
  });

  it("treats a slot the server lists in both arrays as preferred", () => {
    const selection = selectionFromPayload({
      available: [A, B],
      preferred: [B],
    });

    expect(cellState(selection, B)).toBe("preferred");
    expect(toSelectionBody(selection)).toEqual({
      available: [A],
      preferred: [B],
    });
  });

  it("normalizes stored instants so a different spelling is the same slot", () => {
    const selection = selectionFromPayload({
      available: ["2026-10-05T08:00:00+02:00"],
      preferred: [],
    });

    expect(cellState(selection, A)).toBe("available");
  });

  it("compares selections by content, not identity", () => {
    const one = applyState(EMPTY_SELECTION, [A, B], "available");
    const same = applyState(EMPTY_SELECTION, [B, A], "available");
    const different = applyState(one, [B], "preferred");

    expect(selectionsEqual(one, same)).toBe(true);
    expect(selectionsEqual(one, different)).toBe(false);
    expect(selectionsEqual(one, EMPTY_SELECTION)).toBe(false);
  });
});

describe("heatLevel", () => {
  it("is 0 when nobody has marked the slot", () => {
    expect(heatLevel(0, 0, 4)).toBe(0);
  });

  it("is 0 when nobody has responded at all, so the denominator is empty", () => {
    expect(heatLevel(0, 0, 0)).toBe(0);
  });

  it("is the top level when every responded member prefers the slot", () => {
    expect(heatLevel(0, 4, 4)).toBe(4);
  });

  it("weighs a preference twice as heavily as a plain availability", () => {
    // Two of four available scores 2/8; two of four preferring scores 4/8.
    expect(heatLevel(2, 0, 4)).toBeLessThan(heatLevel(0, 2, 4));
  });

  it("never returns 0 for a slot somebody marked", () => {
    expect(heatLevel(1, 0, 20)).toBe(1);
  });
});

const matrix: components["schemas"]["AvailabilityMatrix"] = {
  version: 7,
  slots: [A, B],
  participants: [
    {
      user_id: "u-1",
      display_name: "Grace Hopper",
      responded: true,
      available: [0],
      preferred: [1],
    },
    {
      user_id: "u-2",
      display_name: "Alan Turing",
      responded: true,
      available: [],
      preferred: [],
    },
    {
      user_id: "u-3",
      display_name: "Edsger Dijkstra",
      responded: false,
      available: [],
      preferred: [],
    },
  ],
  aggregate: [
    { slot_index: 0, available_count: 1, preferred_count: 0 },
    { slot_index: 1, available_count: 0, preferred_count: 1 },
  ],
  responded_count: 2,
  member_count: 3,
};

describe("indexMatrix", () => {
  it("names who is available, who prefers a slot and who is missing from it", () => {
    const index = indexMatrix(matrix);

    expect(detailFor(index, A)).toMatchObject({
      availableNames: ["Grace Hopper"],
      preferredNames: [],
      missingNames: ["Alan Turing"],
    });
    expect(detailFor(index, B)).toMatchObject({
      availableNames: [],
      preferredNames: ["Grace Hopper"],
      missingNames: ["Alan Turing"],
    });
  });

  it("excludes a member who has never responded from the names and the denominator", () => {
    const index = indexMatrix(matrix);
    const detail = detailFor(index, A);

    expect(detail.respondedCount).toBe(2);
    expect([
      ...detail.availableNames,
      ...detail.preferredNames,
      ...detail.missingNames,
    ]).not.toContain("Edsger Dijkstra");
  });

  it("takes the counts from the server's aggregate", () => {
    const index = indexMatrix(matrix);
    expect(detailFor(index, B)).toMatchObject({
      availableCount: 0,
      preferredCount: 1,
    });
  });

  it("gives an empty detail for a slot the matrix does not contain", () => {
    expect(detailFor(indexMatrix(matrix), C)).toMatchObject({
      respondedCount: 0,
      availableNames: [],
    });
  });
});

describe("busySlots", () => {
  it("marks every slot a block overlaps, even partially", () => {
    const busy = busySlots(
      [A, B, C],
      [{ start_at: "2026-10-05T06:15:00Z", end_at: "2026-10-05T06:45:00Z" }],
      30,
    );

    expect(busy.has(A)).toBe(true);
    expect(busy.has(B)).toBe(true);
    expect(busy.has(C)).toBe(false);
  });

  it("does not mark a slot a block merely abuts", () => {
    const busy = busySlots(
      [A, B],
      [{ start_at: "2026-10-05T06:30:00Z", end_at: "2026-10-05T07:00:00Z" }],
      30,
    );

    expect(busy.has(A)).toBe(false);
    expect(busy.has(B)).toBe(true);
  });

  it("is empty when there are no blocks", () => {
    expect(busySlots([A, B], [], 30).size).toBe(0);
  });
});

describe("orphanedSlots", () => {
  it("is empty when every selected slot is still offered", () => {
    const selection = applyState(EMPTY_SELECTION, [A, B], "available");

    expect(orphanedSlots(selection, [A, B, C])).toEqual([]);
  });

  it("names the selected slots the server's vector no longer contains, in order", () => {
    const selection = applyState(EMPTY_SELECTION, [C, A, B], "preferred");

    expect(orphanedSlots(selection, [B])).toEqual([A, C]);
  });

  it("is empty for an empty selection, whatever the vector", () => {
    expect(orphanedSlots(EMPTY_SELECTION, [])).toEqual([]);
  });

  it("counts everything as orphaned when the server offers no slots at all", () => {
    const selection = applyState(EMPTY_SELECTION, [A], "available");

    expect(orphanedSlots(selection, [])).toEqual([A]);
  });
});
