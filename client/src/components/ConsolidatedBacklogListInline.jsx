/**
 * Sortable consolidated backlog list (Home).
 * State is updated in onDragOver so our list order drives the UI and the library
 * does not revert it. See: https://dndkit.com/react/guides/sortable-state-management
 * and https://docs.dndkit.com/presets/sortable
 */
import React, { useRef, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useDndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../api';
import { useMutation, useQueryClient } from 'react-query';
import BacklogListItemInline from './BacklogListItemInline';
import './BacklogList.css';

function DragOverlayRow({ itemsToShow }) {
  const { active } = useDndContext();
  if (!active) return null;
  const item = itemsToShow.find((i) => String(i.id) === String(active.id));
  if (!item) return null;
  const staticHandle = (
    <span className="inline-item-drag-handle" aria-hidden>⋮⋮</span>
  );
  return (
    <div className="backlog-list-inline-li backlog-drag-overlay">
      <BacklogListItemInline
        item={item}
        isExpanded={false}
        dragHandle={staticHandle}
        showProject
      />
    </div>
  );
}

function SortableConsolidatedItem({ item, expandedId, onEditClick, onUpdated }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: String(item.id) });

  const dragHandle = (
    <span
      className="inline-item-drag-handle"
      {...attributes}
      {...listeners}
      aria-label="Drag to reorder"
    >
      ⋮⋮
    </span>
  );

  return (
    <li
      className="backlog-list-inline-li"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0 : 1,
        listStyle: 'none'
      }}
    >
      <BacklogListItemInline
        item={item}
        isExpanded={expandedId === item.id}
        onEditClick={onEditClick}
        onUpdated={onUpdated}
        dragHandle={dragHandle}
        sortableRef={setNodeRef}
        showProject
      />
    </li>
  );
}

export default function ConsolidatedBacklogListInline({
  items,
  expandedId,
  onEditClick,
  onUpdated
}) {
  const queryClient = useQueryClient();
  const initialOrderRef = useRef([]);
  const pendingPriorityChangeRef = useRef(null);
  const [localOrder, setLocalOrder] = useState(null);

  const itemsToShow = localOrder ?? items;
  const sortableItemIds = useMemo(() => itemsToShow.map((i) => String(i.id)), [itemsToShow]);
  const itemsToShowRef = useRef(itemsToShow);
  itemsToShowRef.current = itemsToShow;

  const handleUpdated = () => {
    setLocalOrder(null);
    onUpdated?.();
  };

  const reorderMutation = useMutation(
    ({ projectId, itemIds, priorityChanges }) =>
      api.backlog.reorder(projectId, itemIds, priorityChanges),
    {
      onError: (err) => {
        setLocalOrder(null);
        queryClient.invalidateQueries(['backlog-consolidated']);
        console.error('[Backlog reorder] Failed:', err?.message || err, err?.status, err?.data);
      },
      onSuccess: (_data, { projectId }) => {
        setLocalOrder(null);
        queryClient.invalidateQueries(['backlog']);
        queryClient.invalidateQueries(['backlog-consolidated']);
        if (projectId != null) {
          queryClient.removeQueries({
            predicate: (query) =>
              Array.isArray(query.queryKey) &&
              query.queryKey[0] === 'backlog' &&
              query.queryKey[1] === projectId
          });
        }
      }
    }
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = () => {
    // Snapshot order and reset priority tracker — mirrors SortableBacklogListInline
    initialOrderRef.current = itemsToShowRef.current.map((i) => i.id);
    pendingPriorityChangeRef.current = null;
  };

  const handleDragOver = (event) => {
    const { active, over } = event;
    if (!over?.id || String(active.id) === String(over.id)) return;
    const current = itemsToShowRef.current;
    const oldIndex = current.findIndex((i) => String(i.id) === active.id);
    const newIndex = current.findIndex((i) => String(i.id) === String(over.id));
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
    const draggedItem = current[oldIndex];
    const targetItem = current[newIndex];
    if (draggedItem.priority !== targetItem.priority) {
      pendingPriorityChangeRef.current = { [active.id]: targetItem.priority };
    }
    const reordered = arrayMove(current, oldIndex, newIndex);
    const withPriority =
      draggedItem.priority !== targetItem.priority
        ? reordered.map((i) =>
            i.id === draggedItem.id ? { ...i, priority: targetItem.priority } : i
          )
        : reordered;
    setLocalOrder(withPriority);
  };

  const handleDragEnd = (event) => {
    const { active } = event;

    const current = itemsToShowRef.current;

    // Identify dragged item and its project
    const draggedItem = current.find((i) => String(i.id) === String(active.id));
    if (!draggedItem) {
      initialOrderRef.current = [];
      pendingPriorityChangeRef.current = null;
      return;
    }
    const projectId = Number(draggedItem.project_id);
    if (Number.isNaN(projectId)) {
      initialOrderRef.current = [];
      pendingPriorityChangeRef.current = null;
      return;
    }

    // Use the localOrder directly (same as category view) — no extra arrayMove
    const reorderedIds = current.map((i) => i.id);
    const initialIds = initialOrderRef.current;

    const orderChanged =
      reorderedIds.length !== initialIds.length ||
      reorderedIds.some((id, i) => String(id) !== String(initialIds[i]));

    const priorityChanges = pendingPriorityChangeRef.current ?? undefined;
    initialOrderRef.current = [];
    pendingPriorityChangeRef.current = null;

    if (!orderChanged && !priorityChanges) return;

    // Send only this project's items in their current order
    const newOrderForProject = current
      .filter((i) => Number(i.project_id) === projectId)
      .map((i) => i.id);

    reorderMutation.mutate({ projectId, itemIds: newOrderForProject, priorityChanges });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortableItemIds} strategy={verticalListSortingStrategy}>
        <div className="backlog-list-scroll-wrap">
          <ul className="backlog-list backlog-list-inline">
            {itemsToShow.length === 0 && (
              <li className="backlog-list-empty">No items</li>
            )}
            {itemsToShow.map((item) => (
              <SortableConsolidatedItem
                key={item.id}
                item={item}
                expandedId={expandedId}
                onEditClick={onEditClick}
                onUpdated={handleUpdated}
              />
            ))}
          </ul>
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        <DragOverlayRow itemsToShow={itemsToShow} />
      </DragOverlay>
    </DndContext>
  );
}
