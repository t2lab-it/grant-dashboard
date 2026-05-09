import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { useDirectManipulationSortableList } from "../../src/lib/useDirectManipulationSortableList";

function SortableHarness() {
  const [items, setItems] = useState(["alpha", "beta", "gamma", "delta"]);
  const sortable = useDirectManipulationSortableList({
    items,
    onReorder: setItems,
  });

  return (
    <ol aria-label="sortable">
      {items.map((item) => {
        const itemState = sortable.getItemState(item);
        const className = [
          "sortable-list-item",
          itemState.isDragged ? "sortable-list-item-dragging" : "",
          itemState.isSlidingUp ? "sortable-list-item-sliding-up" : "",
          itemState.isSlidingDown ? "sortable-list-item-sliding-down" : "",
        ]
          .filter((value) => value.length > 0)
          .join(" ");

        return (
          <li
            key={item}
            className={className}
            style={itemState.style}
            {...sortable.getItemProps(item)}
          >
            <span>{item}</span>
          </li>
        );
      })}
    </ol>
  );
}

describe("useDirectManipulationSortableList", () => {
  it("supports direct-manipulation drag reordering in a generic list", () => {
    render(<SortableHarness />);

    const list = screen.getByRole("list", { name: "sortable" });
    const getLabels = () =>
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent);

    expect(getLabels()).toEqual(["alpha", "beta", "gamma", "delta"]);

    const listItems = within(list).getAllByRole("listitem");
    const draggedItem = within(listItems[3]).getByText("delta").closest("li");
    const targetItem = within(listItems[1]).getByText("beta").closest("li");
    const middleItem = within(listItems[2]).getByText("gamma").closest("li");

    expect(draggedItem).not.toBeNull();
    expect(targetItem).not.toBeNull();
    expect(middleItem).not.toBeNull();

    fireEvent.dragStart(draggedItem as HTMLElement, { clientX: 100, clientY: 220 });
    fireEvent.dragOver(targetItem as HTMLElement, { clientX: 150, clientY: 140 });

    expect(draggedItem).toHaveClass("sortable-list-item-dragging");
    expect(targetItem).toHaveClass("sortable-list-item-sliding-down");
    expect(middleItem).toHaveClass("sortable-list-item-sliding-down");
    expect(draggedItem).toHaveStyle({ transform: "translateY(-80px)" });

    fireEvent.drop(targetItem as HTMLElement);

    expect(getLabels()).toEqual(["alpha", "delta", "beta", "gamma"]);
  });
});
