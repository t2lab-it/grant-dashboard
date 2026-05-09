import { useRef, useState, type CSSProperties, type DragEvent, type HTMLAttributes } from "react";

type SortableItemKey = string | number;

type UseDirectManipulationSortableListOptions<T extends SortableItemKey> = {
  items: T[];
  onReorder: (items: T[]) => void;
  fallbackItemOffset?: number;
};

type SortableItemState = {
  isDragged: boolean;
  isSlidingUp: boolean;
  isSlidingDown: boolean;
  style?: CSSProperties;
};

type SortableItemProps = Pick<
  HTMLAttributes<HTMLElement>,
  "draggable" | "onDragEnd" | "onDragOver" | "onDragStart" | "onDrop"
>;

let transparentDragPreview: HTMLCanvasElement | null = null;

function getTransparentDragPreview() {
  if (transparentDragPreview !== null) {
    return transparentDragPreview;
  }

  transparentDragPreview = document.createElement("canvas");
  transparentDragPreview.width = 1;
  transparentDragPreview.height = 1;
  return transparentDragPreview;
}

export function reorderSortableItems<T extends SortableItemKey>(
  items: T[],
  sourceKey: T,
  targetKey: T,
) {
  const sourceIndex = items.indexOf(sourceKey);
  const targetIndex = items.indexOf(targetKey);

  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return items;
  }

  const nextItems = [...items];
  const [moved] = nextItems.splice(sourceIndex, 1);
  nextItems.splice(targetIndex, 0, moved);
  return nextItems;
}

export function useDirectManipulationSortableList<T extends SortableItemKey>({
  items,
  onReorder,
  fallbackItemOffset = 40,
}: UseDirectManipulationSortableListOptions<T>) {
  const [draggedItemKey, setDraggedItemKey] = useState<T | null>(null);
  const [dragTargetItemKey, setDragTargetItemKey] = useState<T | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const dragStartYRef = useRef<number | null>(null);

  const draggedItemIndex = draggedItemKey === null ? -1 : items.indexOf(draggedItemKey);
  const dragTargetItemIndex = dragTargetItemKey === null ? -1 : items.indexOf(dragTargetItemKey);

  function resetDragState() {
    setDraggedItemKey(null);
    setDragTargetItemKey(null);
    dragStartYRef.current = null;
    setDragOffsetY(0);
  }

  function updateDragOffset(event: DragEvent<HTMLElement>, targetItemKey: T) {
    if (dragTargetItemKey !== targetItemKey) {
      setDragTargetItemKey(targetItemKey);
    }

    if (dragStartYRef.current !== null && event.clientY) {
      setDragOffsetY(event.clientY - dragStartYRef.current);
      return;
    }

    if (draggedItemIndex >= 0) {
      const targetIndex = items.indexOf(targetItemKey);
      setDragOffsetY((targetIndex - draggedItemIndex) * fallbackItemOffset);
    }
  }

  function getItemProps(itemKey: T): SortableItemProps {
    return {
      draggable: true,
      onDragStart: (event) => {
        setDraggedItemKey(itemKey);
        setDragTargetItemKey(itemKey);
        dragStartYRef.current = event.clientY || 0;
        setDragOffsetY(0);
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setDragImage(getTransparentDragPreview(), 0, 0);
        }
      },
      onDragEnd: () => {
        resetDragState();
      },
      onDragOver: (event) => {
        event.preventDefault();
        updateDragOffset(event, itemKey);
      },
      onDrop: () => {
        if (draggedItemKey !== null) {
          onReorder(reorderSortableItems(items, draggedItemKey, itemKey));
        }
        resetDragState();
      },
    };
  }

  function getItemState(itemKey: T): SortableItemState {
    const itemIndex = items.indexOf(itemKey);
    const isDragged = draggedItemKey === itemKey;
    const isSlidingDown =
      draggedItemIndex > dragTargetItemIndex &&
      dragTargetItemIndex >= 0 &&
      itemIndex >= dragTargetItemIndex &&
      itemIndex < draggedItemIndex;
    const isSlidingUp =
      draggedItemIndex >= 0 &&
      draggedItemIndex < dragTargetItemIndex &&
      itemIndex > draggedItemIndex &&
      itemIndex <= dragTargetItemIndex;

    return {
      isDragged,
      isSlidingUp,
      isSlidingDown,
      style: isDragged ? { transform: `translateY(${dragOffsetY}px)` } : undefined,
    };
  }

  return {
    getItemProps,
    getItemState,
  };
}
