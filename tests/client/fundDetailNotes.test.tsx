import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useFundDetailNotes } from "../../src/features/funds/useFundDetailNotes";

function NotesHarness({
  notesDisplayMode,
  prefersHoverNotes,
}: {
  notesDisplayMode: "hover" | "click" | "expanded";
  prefersHoverNotes: boolean;
}) {
  const { actualNotes } = useFundDetailNotes(notesDisplayMode, prefersHoverNotes);

  return (
    <div>
      <div data-testid="actual-pinned">{actualNotes.pinnedEntryId ?? "none"}</div>
      <div data-testid="actual-hovered">{actualNotes.hoveredEntryId ?? "none"}</div>
      <div data-testid="actual-expanded">{String(actualNotes.isExpanded(10, true))}</div>
      <button type="button" onClick={() => actualNotes.onRowClick(10, true)}>
        toggle actual note
      </button>
      <button type="button" onMouseEnter={() => actualNotes.onRowHover(10, true)}>
        hover actual note
      </button>
      <div
        tabIndex={0}
        onBlur={actualNotes.onRowBlur}
        onFocus={() => actualNotes.onRowHover(10, true)}
      >
        actual note focus region
      </div>
      <button type="button">outside target</button>
    </div>
  );
}

describe("useFundDetailNotes", () => {
  afterEach(() => {
    cleanup();
  });

  it("toggles pinned notes on click in click mode", () => {
    render(<NotesHarness notesDisplayMode="click" prefersHoverNotes={false} />);

    const toggleButton = screen.getByRole("button", { name: "toggle actual note" });

    expect(screen.getByTestId("actual-pinned")).toHaveTextContent("none");
    expect(screen.getByTestId("actual-expanded")).toHaveTextContent("false");

    fireEvent.click(toggleButton);

    expect(screen.getByTestId("actual-pinned")).toHaveTextContent("10");
    expect(screen.getByTestId("actual-expanded")).toHaveTextContent("true");

    fireEvent.click(toggleButton);

    expect(screen.getByTestId("actual-pinned")).toHaveTextContent("none");
    expect(screen.getByTestId("actual-expanded")).toHaveTextContent("false");
  });

  it("reveals hover notes and clears them when focus leaves the row", () => {
    render(<NotesHarness notesDisplayMode="hover" prefersHoverNotes={true} />);

    const hoverButton = screen.getByRole("button", { name: "hover actual note" });
    const focusRegion = screen.getByText("actual note focus region");
    const outsideTarget = screen.getByRole("button", { name: "outside target" });

    fireEvent.mouseEnter(hoverButton);
    expect(screen.getByTestId("actual-hovered")).toHaveTextContent("10");
    expect(screen.getByTestId("actual-expanded")).toHaveTextContent("true");

    fireEvent.focus(focusRegion);
    fireEvent.blur(focusRegion, { relatedTarget: outsideTarget });

    expect(screen.getByTestId("actual-hovered")).toHaveTextContent("none");
    expect(screen.getByTestId("actual-expanded")).toHaveTextContent("false");
  });

  it("keeps notes expanded in expanded mode", () => {
    render(<NotesHarness notesDisplayMode="expanded" prefersHoverNotes={false} />);

    expect(screen.getByTestId("actual-expanded")).toHaveTextContent("true");
  });
});
