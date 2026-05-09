import { useState, type FocusEvent, type KeyboardEvent } from "react";

type NotesDisplayMode = "hover" | "click" | "expanded";

export type FundDetailNoteController = {
  pinnedEntryId: number | null;
  hoveredEntryId: number | null;
  isInteractive: (hasNotes: boolean) => boolean;
  isExpanded: (entryId: number, hasNotes: boolean) => boolean;
  onRowClick: (entryId: number, hasNotes: boolean) => void;
  onRowKeyDown: (
    event: KeyboardEvent<HTMLDivElement>,
    entryId: number,
    hasNotes: boolean,
  ) => void;
  onRowHover: (entryId: number, hasNotes: boolean) => void;
  onRowLeave: (entryId: number, hasNotes: boolean) => void;
  onRowBlur: (event: FocusEvent<HTMLDivElement>) => void;
};

function useNoteController({
  keepsNotesExpanded,
  usesHoverToRevealNotes,
  usesClickToToggleNotes,
}: {
  keepsNotesExpanded: boolean;
  usesHoverToRevealNotes: boolean;
  usesClickToToggleNotes: boolean;
}): FundDetailNoteController {
  const [pinnedEntryId, setPinnedEntryId] = useState<number | null>(null);
  const [hoveredEntryId, setHoveredEntryId] = useState<number | null>(null);

  function isInteractive(hasNotes: boolean) {
    return hasNotes && !keepsNotesExpanded;
  }

  function isExpanded(entryId: number, hasNotes: boolean) {
    return (
      (hasNotes && keepsNotesExpanded) ||
      pinnedEntryId === entryId ||
      (usesHoverToRevealNotes && pinnedEntryId === null && hoveredEntryId === entryId)
    );
  }

  function onRowClick(entryId: number, hasNotes: boolean) {
    if (!hasNotes || keepsNotesExpanded || !usesClickToToggleNotes) {
      return;
    }

    setPinnedEntryId((current) => (current === entryId ? null : entryId));
    setHoveredEntryId(null);
  }

  function onRowKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    entryId: number,
    hasNotes: boolean,
  ) {
    if (!hasNotes || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    onRowClick(entryId, hasNotes);
  }

  function onRowHover(entryId: number, hasNotes: boolean) {
    if (!usesHoverToRevealNotes || !hasNotes) {
      return;
    }

    if (pinnedEntryId !== null && pinnedEntryId !== entryId) {
      return;
    }

    setHoveredEntryId(entryId);
  }

  function onRowLeave(entryId: number, hasNotes: boolean) {
    if (!usesHoverToRevealNotes || !hasNotes) {
      return;
    }

    setHoveredEntryId((current) => (current === entryId ? null : current));
  }

  function onRowBlur(event: FocusEvent<HTMLDivElement>) {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }

    setHoveredEntryId(null);
  }

  return {
    pinnedEntryId,
    hoveredEntryId,
    isInteractive,
    isExpanded,
    onRowClick,
    onRowKeyDown,
    onRowHover,
    onRowLeave,
    onRowBlur,
  };
}

export function useFundDetailNotes(
  notesDisplayMode: NotesDisplayMode,
  prefersHoverNotes: boolean,
) {
  const keepsNotesExpanded = notesDisplayMode === "expanded";
  const usesHoverToRevealNotes = notesDisplayMode === "hover" && prefersHoverNotes;
  const usesClickToToggleNotes = !keepsNotesExpanded;

  return {
    keepsNotesExpanded,
    usesHoverToRevealNotes,
    usesClickToToggleNotes,
    actualNotes: useNoteController({
      keepsNotesExpanded,
      usesHoverToRevealNotes,
      usesClickToToggleNotes,
    }),
    plannedNotes: useNoteController({
      keepsNotesExpanded,
      usesHoverToRevealNotes,
      usesClickToToggleNotes,
    }),
  };
}
