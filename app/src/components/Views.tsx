import { useRef, useState } from "react";
import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { ArrowUpToLine, CalendarDays, Check, ChevronRight, Clock3, ExternalLink, ListChecks, NotebookPen, Plus, Sparkles } from "lucide-react";
import { enUS, zhCN } from "date-fns/locale";
import { formatShort, type Status, type Task } from "@/lib/tasks";
import { usePreferences } from "@/providers/preferences";

const statusKeys = { todo: "statusTodo", doing: "statusDoing", done: "statusDone" } as const;
const hintKeys = { todo: "hintTodo", doing: "hintDoing", done: "hintDone" } as const;
const priorityKeys = { low: "priorityLow", medium: "priorityMedium", high: "priorityHigh" } as const;
const priorityTitleKeys = { low: "lowPriority", medium: "mediumPriority", high: "highPriority" } as const;
const byPosition = (a: Task, b: Task) => (a.position ?? 0) - (b.position ?? 0) || b.createdAt - a.createdAt;
function reorderIds(list: Task[], draggedId: string, targetId?: string) {
  const ids = list.map((task) => task.id);
  const from = ids.indexOf(draggedId);
  if (from < 0) return ids;
  ids.splice(from, 1);
  const target = targetId ? ids.indexOf(targetId) : ids.length;
  ids.splice(target < 0 ? ids.length : target, 0, draggedId);
  return ids;
}

export function TaskCard({ task, onEdit, onUpdate, onDragStart, onDropTask, onPin, dropTargetId, onDropTargetChange }: { task: Task; onEdit: (task: Task) => void; onUpdate?: (task: Task) => void; onDragStart?: (e: React.DragEvent, task: Task) => void; onDropTask?: (e: React.DragEvent, task: Task) => void; onPin?: (task: Task) => void; dropTargetId?: string | null; onDropTargetChange?: (task: Task | null) => void }) {
  const { language, t } = usePreferences();
  const [dragging, setDragging] = useState(false);
  const dragOver = dropTargetId === task.id;
  const startDrag = (e: React.DragEvent) => {
    if (!onDragStart) return;
    setDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const ghost = e.currentTarget.cloneNode(true) as HTMLElement;
    ghost.classList.add("drag-ghost");
    ghost.style.width = `${rect.width}px`;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, e.clientX - rect.left, e.clientY - rect.top);
    window.setTimeout(() => ghost.remove(), 0);
    onDragStart(e, task);
  };
  return <article className={`task-card priority-${task.priority} ${dragOver ? "drag-over" : ""} ${dragging ? "dragging" : ""}`} draggable={!!onDragStart} onDragStart={startDrag} onDragEnd={() => { setDragging(false); onDropTargetChange?.(null); }} onDragEnter={() => { if (onDropTask) onDropTargetChange?.(task); }} onDragOver={(e) => { if (onDropTask) { e.preventDefault(); onDropTargetChange?.(task); } }} onDrop={(e) => { if (onDropTask) { e.preventDefault(); e.stopPropagation(); onDropTargetChange?.(null); onDropTask(e, task); } }} onClick={() => onEdit(task)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onEdit(task)}>
    <div className="task-card-top"><span className="project-label">{task.project}</span><span className="task-card-top-actions">{onPin && <button className="pin-task-button" onClick={(e) => { e.stopPropagation(); onPin(task); }} aria-label={t("pinTask", { title: task.title })} title={t("pinToTop")}><ArrowUpToLine size={13} /></button>}<span className={`priority-dot ${task.priority}`} title={t(priorityTitleKeys[task.priority])} /></span></div>
    <h3>{task.title}</h3>
    {task.description && <p>{task.description}</p>}
    {(task.checklist?.length || 0) > 0 && <div className="card-checklist"><ListChecks size={13} /><span>{t("itemsDone", { done: task.checklist?.filter((item) => item.completed).length || 0, total: task.checklist?.length || 0 })}</span></div>}
    {task.sourceUrl && <a className="source-link" href={task.sourceUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><ExternalLink size={13} />{t("viewNotice")}</a>}
    {task.status !== "todo" && <div className="card-progress"><div><i style={{ width: `${task.progress}%` }} /></div><span>{task.progress}%</span></div>}
    <footer><span className="task-date"><CalendarDays size={14} />{formatShort(task.dueDate, language)}</span><span className="task-card-footer-actions"><span className={`priority-text ${task.priority}`}>{t(priorityKeys[task.priority])}</span>{onUpdate && <button className="update-progress-button" onClick={(e) => { e.stopPropagation(); onUpdate(task); }} aria-label={t("recordTaskProgress", { title: task.title })}><NotebookPen size={13} />{t("recordProgress")}{(task.logs?.length || 0) > 0 && <i>{task.logs?.length}</i>}</button>}</span></footer>
  </article>;
}

export function BoardView({ tasks, onEdit, onUpdate, onStatus, onNew, onReorder }: { tasks: Task[]; onEdit: (task: Task) => void; onUpdate: (task: Task) => void; onStatus: (id: string, status: Status) => void; onNew: (status?: Status) => void; onReorder: (orderedIds: string[]) => void }) {
  const { t } = usePreferences();
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const statuses: Status[] = ["todo", "doing", "done"];
  return <div className="board-grid">{statuses.map((status) => {
    const list = tasks.filter((task) => task.status === status).sort(byPosition);
    return <section className={`board-column column-${status}`} key={status} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setDropTargetId(null); const draggedId = e.dataTransfer.getData("text/task-id"); const dragged = tasks.find((task) => task.id === draggedId); if (!dragged) return; if (dragged.status !== status) return onStatus(draggedId, status); onReorder(reorderIds(list, draggedId)); }}>
      <header className="column-head"><div><span className="status-indicator" /><h2>{t(statusKeys[status])}</h2><span className="count-badge">{list.length}</span></div><button className="icon-button small" onClick={() => onNew(status)} aria-label={t("addStatusWork", { status: t(statusKeys[status]) })}><Plus size={18} /></button></header>
      <p className="column-hint">{t(hintKeys[status])}</p>
      <div className={`column-tasks ${list.length > 4 ? "scrollable-tasks" : ""}`}>{list.map((task) => <TaskCard key={task.id} task={task} onEdit={onEdit} onUpdate={onUpdate} onDragStart={(e, current) => { e.dataTransfer.setData("text/task-id", current.id); e.dataTransfer.effectAllowed = "move"; }} onDropTask={(e, target) => { const draggedId = e.dataTransfer.getData("text/task-id"); const dragged = tasks.find((item) => item.id === draggedId); if (!dragged) return; if (dragged.status !== status) return onStatus(draggedId, status); onReorder(reorderIds(list, draggedId, target.id)); }} onPin={(current) => onReorder([current.id, ...list.filter((task) => task.id !== current.id).map((task) => task.id)])} dropTargetId={dropTargetId} onDropTargetChange={(task) => setDropTargetId(task?.id ?? null)} />)}
        {list.length === 0 && <button className="empty-column" onClick={() => onNew(status)}><Plus size={18} /><span>{t("addWork")}</span></button>}
      </div>{list.length > 4 && <span className="scroll-hint">{t("scrollForMore")}</span>}
    </section>;
  })}</div>;
}

export function GanttView({ tasks, onEdit, onMove }: { tasks: Task[]; onEdit: (task: Task) => void; onMove: (task: Task, days: number) => void }) {
  const { language, t } = usePreferences();
  const [drag, setDrag] = useState<{ id: string; delta: number } | null>(null);
  const dragStart = useRef<{ id: string; x: number } | null>(null);
  const moved = useRef(false);
  const today = startOfDay(new Date());
  const rangeStart = addDays(today, -7);
  const days = Array.from({ length: 35 }, (_, i) => addDays(rangeStart, i));
  const sorted = [...tasks].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const shifted = (date: string, offset: number) => format(addDays(new Date(`${date}T12:00:00`), offset), "yyyy-MM-dd");
  const finishDrag = (task: Task, start: number, duration: number) => {
    if (!drag || drag.id !== task.id) return;
    const rawDays = Math.round(drag.delta / 56);
    const dayOffset = duration > 35 ? rawDays : Math.max(-start, Math.min(35 - start - duration, rawDays));
    if (dayOffset) onMove(task, dayOffset);
    dragStart.current = null;
    setDrag(null);
  };
  return <div className="gantt-shell">
    <div className="gantt-head"><div><h2>{t("timePlan")}</h2><p>{t("ganttSubtitle")}</p></div><div className="gantt-legend"><span><i className="legend-doing" />{t("statusDoing")}</span><span><i className="legend-todo" />{t("statusTodo")}</span><span><i className="legend-done" />{t("statusDone")}</span></div></div>
    <div className="gantt-scroll"><div className="gantt-canvas">
      <div className="gantt-label-head">{t("workItem")}</div><div className="gantt-calendar-head">{days.map((day, i) => <div key={i} className={`${format(day, "yyyy-MM-dd") === format(today, "yyyy-MM-dd") ? "today" : ""} ${[0, 6].includes(day.getDay()) ? "weekend" : ""}`}><span>{format(day, "EEE", { locale: language === "zh" ? zhCN : enUS })}</span><b>{format(day, "d")}</b></div>)}</div>
      <div className="gantt-body"><div className="gantt-today-line" style={{ left: `calc(240px + ${7 * 56 + 28}px)` }} />
        {sorted.map((task) => {
          const start = differenceInCalendarDays(new Date(`${task.startDate}T12:00:00`), rangeStart);
          const duration = Math.max(1, differenceInCalendarDays(new Date(`${task.dueDate}T12:00:00`), new Date(`${task.startDate}T12:00:00`)) + 1);
          const visible = start + duration > 0 && start < 35;
          const dragging = drag?.id === task.id;
          const previewStart = dragging ? shifted(task.startDate, Math.round(drag.delta / 56)) : task.startDate;
          const previewDue = dragging ? shifted(task.dueDate, Math.round(drag.delta / 56)) : task.dueDate;
          return <div className="gantt-row" key={task.id}>
            <button className="gantt-task-label" onClick={() => onEdit(task)}><span>{task.title}</span><small>{task.project}</small></button>
            <div className="gantt-track">{days.map((_, i) => <i key={i} className={i % 7 >= 5 ? "weekend-cell" : ""} />)}{visible && <><button className={`gantt-bar ${task.status} ${dragging ? "dragging" : ""}`} style={{ left: `${Math.max(0, start) * 56 + 5}px`, width: `${Math.max(44, Math.min(duration, 35 - Math.max(0, start)) * 56 - 10)}px`, transform: dragging ? `translateX(${drag.delta}px)` : undefined }} onPointerDown={(e) => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); dragStart.current = { id: task.id, x: e.clientX }; moved.current = false; setDrag({ id: task.id, delta: 0 }); }} onPointerMove={(e) => { if (dragStart.current?.id !== task.id) return; const delta = e.clientX - dragStart.current.x; if (Math.abs(delta) > 4) moved.current = true; setDrag({ id: task.id, delta }); }} onPointerUp={() => finishDrag(task, start, duration)} onPointerCancel={() => { dragStart.current = null; setDrag(null); }} onKeyDown={(e) => { if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); onMove(task, e.key === "ArrowLeft" ? -1 : 1); } }} onClick={() => { if (moved.current) { moved.current = false; return; } onEdit(task); }} title={`${task.title} · ${formatShort(previewStart, language)}—${formatShort(previewDue, language)}`}><span>{task.status === "done" && <Check size={13} />}{task.progress}%</span><i style={{ width: `${task.progress}%` }} /></button>{dragging && <span className="gantt-drag-dates" style={{ left: `${Math.max(0, start) * 56 + 12}px` }}>{formatShort(previewStart, language)}—{formatShort(previewDue, language)}</span>}</>}</div>
          </div>;
        })}{sorted.length === 0 && <div className="gantt-empty">{t("noSchedule")}</div>}
      </div>
    </div></div>
    <div className="gantt-tip"><Clock3 size={15} />{t("ganttTip")}<ChevronRight size={15} /></div>
  </div>;
}

export function FocusView({ tasks, onEdit, onUpdate, onBoard, onReorder }: { tasks: Task[]; onEdit: (task: Task) => void; onUpdate: (task: Task) => void; onBoard: () => void; onReorder: (orderedIds: string[]) => void }) {
  const { language, t } = usePreferences();
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const doing = tasks.filter((task) => task.status === "doing").sort(byPosition);
  const upcoming = tasks.filter((task) => task.status !== "done").sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.dueDate.localeCompare(b.dueDate)).slice(0, 5);
  const drop = (list: Task[], e: React.DragEvent, targetId?: string) => {
    const draggedId = e.dataTransfer.getData("text/task-id");
    if (!list.some((task) => task.id === draggedId)) return;
    onReorder(reorderIds(list, draggedId, targetId));
  };
  return <div className="focus-layout"><section className="focus-main glass-panel"><div className="section-title"><div><span className="overline">NOW</span><h2>{t("focusNow")}</h2></div><button className="text-button" onClick={onBoard}>{t("viewBoard")}<ChevronRight size={16} /></button></div><div className={`focus-cards ${doing.length > 4 ? "scrollable-focus" : ""}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { setDropTargetId(null); drop(doing, e); }}>{doing.length ? doing.map((task) => <TaskCard key={task.id} task={task} onEdit={onEdit} onUpdate={onUpdate} onDragStart={(e, current) => { e.dataTransfer.setData("text/task-id", current.id); e.dataTransfer.effectAllowed = "move"; }} onDropTask={(e, target) => drop(doing, e, target.id)} onPin={(current) => onReorder([current.id, ...doing.filter((task) => task.id !== current.id).map((task) => task.id)])} dropTargetId={dropTargetId} onDropTargetChange={(task) => setDropTargetId(task?.id ?? null)} />) : <div className="empty-focus"><Sparkles size={22} /><b>{t("noDoing")}</b><span>{t("noDoingHint")}</span></div>}</div></section>
    <aside className="upcoming glass-panel"><div className="section-title"><div><span className="overline">UP NEXT</span><h2>{t("upNext")}</h2></div></div><div className="upcoming-list" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { setDropTargetId(null); drop(upcoming, e); }}>{upcoming.map((task) => <button key={task.id} draggable onDragStart={(e) => { e.dataTransfer.setData("text/task-id", task.id); e.dataTransfer.effectAllowed = "move"; }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(upcoming, e, task.id); }} onClick={() => onEdit(task)}><span className={`upcoming-date ${task.priority}`}>{format(new Date(`${task.dueDate}T12:00:00`), "dd")}<small>{format(new Date(`${task.dueDate}T12:00:00`), "MMM", { locale: language === "zh" ? zhCN : enUS })}</small></span><span><b>{task.title}</b><small>{task.project}</small></span><ChevronRight size={16} /></button>)}</div></aside>
  </div>;
}
