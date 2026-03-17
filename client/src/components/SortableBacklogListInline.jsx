import React, { useRef, useState, useMemo } from 'react';
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

function DragOverlayRow({ itemsToShow, projectColor }) {
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
        projectColor={projectColor}
      />
    </div>
  );
}

function SortableInlineItem({ item, expandedId, onEditClick, onUpdated, projectColor }) {
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
        projectColor={projectColor}
      />
    </li>
  );
}

export default function SortableBacklogListInline({
  projectId,
  items,
  expandedId,
  onEditClick,
  onUpdated,
  projectColor
}) {
  const queryClient = useQueryClient();
  const initialOrderRef = useRef([]);
  const pendingPriorityChangeRef = useRef(null);
  const [localOrder, setLocalOrder] = useState(null);

  const itemsToShow = localOrder ?? items;
  const sortableItemIds = useMemo(() => itemsToShow.map((i) => String(i.id)), [itemsToShow]);
  const itemsToShowRef = useRef(itemsToShow);
  itemsToShowRef.current = itemsToShow;

  const handleUpdated = (updatedItem) => {
    setLocalOrder(null);
    onUpdated?.(updatedItem);
  };

  const reorderMutation = useMutation(
    ({ itemIds, priorityChanges }) => api.backlog.reorder(projectId, itemIds, priorityChanges),
    {
      onError: (err) => {
        setLocalOrder(null);
        queryClient.invalidateQueries(['backlog']);
        queryClient.invalidateQueries(['backlog-consolidated']);
        console.error('Reorder failed:', err?.data?.error || err?.message || err);
      },
      onSuccess: () => {
        setLocalOrder(null);
        queryClient.invalidateQueries(['backlog']);
        queryClient.invalidateQueries(['backlog-consolidated']);
      }
    }
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragOver = (event) => {
    const { active, over } = event;
    if (!over?.id || String(active.id) === String(over.id)) return;
    const current = itemsToShowRef.current;
    const oldIndex = current.findIndex((i) => String(i.id) === active.id);
    const newIndex = current.findIndex((i) => String(i.id) === String(over.id));
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
    const draggedItem = current[oldIndex];
    const targetItem = current[newIndex];
    const reordered = arrayMove(current, oldIndex, newIndex);
    if (draggedItem.priority !== targetItem.priority) {
      pendingPriorityChangeRef.current = { [active.id]: targetItem.priority };
    }
    const withPriority =
      draggedItem.priority !== targetItem.priority
        ? reordered.map((i) =>
            i.id === draggedItem.id ? { ...i, priority: targetItem.priority } : i
          )
        : reordered;
    setLocalOrder(withPriority);
  };

  const handleDragStart = () => {
    initialOrderRef.current = itemsToShowRef.current.map((i) => i.id);
    pendingPriorityChangeRef.current = null;
  };

  const handleDragEnd = (event) => {
    const { active } = event;
    const current = itemsToShowRef.current;
    const reorderedIds = current.map((i) => i.id);
    const initialIds = initialOrderRef.current;
    const orderChanged =
      reorderedIds.length !== initialIds.length ||
      reorderedIds.some((id, i) => String(id) !== String(initialIds[i]));
    if (!orderChanged) {
      initialOrderRef.current = [];
      pendingPriorityChangeRef.current = null;
      return;
    }
    const priorityChanges = pendingPriorityChangeRef.current ?? undefined;
    initialOrderRef.current = [];
    pendingPriorityChangeRef.current = null;
    reorderMutation.mutate({ itemIds: reorderedIds, priorityChanges });
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
        <ul className="backlog-list backlog-list-inline">
          {itemsToShow.length === 0 && (
            <li className="backlog-list-empty">No items</li>
          )}
          {itemsToShow.map((item) => (
            <SortableInlineItem
              key={item.id}
              item={item}
              expandedId={expandedId}
              onEditClick={onEditClick}
              onUpdated={handleUpdated}
              projectColor={projectColor}
            />
          ))}
        </ul>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        <DragOverlayRow itemsToShow={itemsToShow} projectColor={projectColor} />
      </DragOverlay>
    </DndContext>
  );
}
