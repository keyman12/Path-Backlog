import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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
import { getDueDateStatus } from '../utils/dateAlerts';
import './BacklogList.css';

const PRIORITY_COLORS = { Now: 'var(--path-primary)', Soon: 'var(--path-primary-light-1)', Later: 'var(--path-grey-500)' };

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function SortableItem({ item, isSelected, onSelect }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: String(item.id) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <li
      ref={setNodeRef}
      style={{ ...style, borderLeftColor: item.color_label || PRIORITY_COLORS[item.priority] || 'transparent' }}
      className={`backlog-list-item ${isSelected ? 'backlog-list-item-selected' : ''} ${isDragging ? 'backlog-list-item-dragging' : ''}`}
    >
      <div className="backlog-list-item-row">
        <span
          className="backlog-list-item-drag-handle"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          ⋮⋮
        </span>
        <span className="backlog-list-item-title" onClick={() => onSelect(item.id)}>
          {item.title}
        </span>
<span className={`backlog-list-item-priority priority-${(item.priority || '').toLowerCase()}`}>
                {item.priority === 'Soon' ? 'Next' : (item.priority || 'Later')}
        </span>
      </div>
      {item.description && (
        <div className="backlog-list-item-description">{item.description}</div>
      )}
      <div className="backlog-list-item-meta">
        {item.due_date && (
          <>
            <span className="backlog-list-item-date">{formatDate(item.due_date)}</span>
            {getDueDateStatus(item.due_date) === 'overdue' && (
              <span className="backlog-list-item-due-alert due-overdue">Overdue</span>
            )}
            {getDueDateStatus(item.due_date) === 'due_soon' && (
              <span className="backlog-list-item-due-alert due-soon">Due soon</span>
            )}
          </>
        )}
        {item.progress != null && item.progress > 0 && (
          <span className="backlog-list-item-progress">{item.progress}%</span>
        )}
      </div>
    </li>
  );
}

export default function SortableBacklogList({ projectId, items, selectedId, onSelect }) {
  const queryClient = useQueryClient();
  const reorderMutation = useMutation(
    (itemIds) => api.backlog.reorder(projectId, itemIds),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['backlog', projectId]);
        queryClient.invalidateQueries(['backlog-consolidated']);
      }
    }
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = items.map((i) => i.id);
    const oldIndex = ids.indexOf(Number(active.id));
    const newIndex = ids.indexOf(Number(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(ids, oldIndex, newIndex);
    reorderMutation.mutate(reordered);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => String(i.id))} strategy={verticalListSortingStrategy}>
        <ul className="backlog-list">
          {items.length === 0 && (
            <li className="backlog-list-empty">No items</li>
          )}
          {items.map((item) => (
            <SortableItem
              key={item.id}
              item={item}
              isSelected={selectedId === item.id}
              onSelect={onSelect}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
