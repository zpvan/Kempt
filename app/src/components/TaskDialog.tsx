import { useEffect, useState } from "react";
import { X, Trash2, NotebookPen, ListChecks, Plus } from "lucide-react";
import { checklistProgress, emptyTask, type ChecklistItem, type Priority, type Status, type Task } from "@/lib/tasks";
import { usePreferences } from "@/providers/preferences";
import { clearDraft, taskDraftKey, taskItemsDraftKey, useDraftState } from "@/lib/drafts";

const statusKeys = { todo: "statusTodo", doing: "statusDoing", done: "statusDone" } as const;
const priorityKeys = { low: "lowPriority", medium: "mediumPriority", high: "highPriority" } as const;

interface Props {
  userId: string;
  task?: Task | null;
  onClose: () => void;
  onSave: (task: Omit<Task, "id" | "createdAt">, id?: string) => void;
  onDelete?: (id: string) => void;
  defaultStatus?: Status;
  onUpdate?: (task: Task) => void;
}

export default function TaskDialog({ userId, task, onClose, onSave, onDelete, defaultStatus = "todo", onUpdate }: Props) {
  const { t } = usePreferences();
  const draftKey = taskDraftKey(userId, task?.id ?? "new");
  const itemsDraftKey = taskItemsDraftKey(userId, task?.id ?? "new");
  const [form, setForm, formRestored] = useDraftState(draftKey, task ? { ...task } : { ...emptyTask(), project: t("defaultProject"), status: defaultStatus });
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [checklist, setChecklist, itemsRestored] = useDraftState<ChecklistItem[]>(itemsDraftKey, task?.checklist ?? []);
  const [newItem, setNewItem] = useState("");
  const close = () => { clearDraft(draftKey, itemsDraftKey); onClose(); };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, draftKey, itemsDraftKey]);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm({ ...form, [key]: value });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.title.trim().length < 2) return setError(t("titleValidation"));
    if (form.dueDate < form.startDate) return setError(t("dateValidation"));
    const items = checklist.map((item, position) => ({ ...item, completed: form.status === "done" ? true : item.completed, position }));
    const status = items.length > 0 && items.every((item) => item.completed) ? "done" : form.status;
    const progress = items.length ? (status === "done" ? 100 : checklistProgress(items)) : form.status === "done" ? 100 : form.progress;
    onSave({ title: form.title.trim(), description: form.description.trim(), project: form.project.trim() || t("defaultProject"), status, priority: form.priority, startDate: form.startDate, dueDate: form.dueDate, progress, parentId: form.parentId, sourceUrl: form.sourceUrl?.trim() || undefined, checklist: items }, task?.id);
  };
  const addItem = () => {
    if (!newItem.trim()) return;
    setChecklist([...checklist, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, content: newItem.trim(), completed: false, position: checklist.length, createdAt: Date.now() }]);
    setNewItem("");
    if (form.status === "done") set("status", "doing");
  };
  const currentProgress = checklist.length ? (form.status === "done" ? 100 : checklistProgress(checklist)) : form.status === "done" ? 100 : form.progress;
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
    <section className="dialog task-dialog" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title">
      <header className="dialog-head">
        <div><span className="overline">WORK ITEM</span><h2 id="task-dialog-title">{t(task ? "editWork" : "newWork")}</h2></div>
        <div className="dialog-head-actions">{task && onUpdate && <button type="button" className="button secondary compact" onClick={() => onUpdate(task)}><NotebookPen size={15} />{t("recordProgress")}</button>}<button className="icon-button" onClick={close} aria-label={t("close")}><X size={20} /></button></div>
      </header>
      <form onSubmit={submit}>
        <div className="form-body">
          {(formRestored || itemsRestored) && <p className="draft-restored">{t("draftRestored")}</p>}
          <label className="field full"><span>{t("workTitle")}</span><input autoFocus value={form.title} onChange={(e) => set("title", e.target.value)} placeholder={t("titlePlaceholder")} maxLength={120} /></label>
          <label className="field full"><span>{t("description")}</span><textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder={t("descriptionPlaceholder")} rows={3} /></label>
          <label className="field"><span>{t("project")}</span><input value={form.project} onChange={(e) => set("project", e.target.value)} placeholder={t("defaultProject")} /></label>
          <label className="field"><span>{t("currentStatus")}</span><select value={form.status} onChange={(e) => set("status", e.target.value as Status)}>{(["todo", "doing", "done"] as Status[]).map((key) => <option key={key} value={key}>{t(statusKeys[key])}</option>)}</select></label>
          <label className="field full"><span>{t("sourceOptional")}</span><input type="url" value={form.sourceUrl || ""} onChange={(e) => set("sourceUrl", e.target.value)} placeholder="https://" /></label>
          <label className="field"><span>{t("startDate")}</span><input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} /></label>
          <label className="field"><span>{t("dueDate")}</span><input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></label>
          <div className="field full"><span>{t("priority")}</span><div className="segment-control three">{(["low", "medium", "high"] as Priority[]).map((p) => <button type="button" key={p} className={form.priority === p ? "active" : ""} onClick={() => set("priority", p)}>{t(priorityKeys[p])}</button>)}</div></div>
          <div className="field full checklist-field"><span><ListChecks size={14} />{t("checklist")}<b>{checklist.length ? `${checklist.filter((item) => item.completed).length}/${checklist.length}` : ""}</b></span>
            <div className="checklist-items">{checklist.map((item) => <div className={`checklist-item ${item.completed ? "completed" : ""}`} key={item.id}><label><input type="checkbox" checked={item.completed} onChange={() => { setChecklist(checklist.map((entry) => entry.id === item.id ? { ...entry, completed: !entry.completed } : entry)); if (form.status === "done" && item.completed) set("status", "doing"); }} /><span>{item.content}</span></label><button type="button" className="icon-button small" onClick={() => setChecklist(checklist.filter((entry) => entry.id !== item.id))} aria-label={t("delete")}><X size={14} /></button></div>)}</div>
            {!checklist.length && <p className="checklist-empty">{t("checklistEmpty")}</p>}
            <div className="checklist-add"><input value={newItem} onChange={(event) => setNewItem(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addItem(); } }} placeholder={t("checklistPlaceholder")} maxLength={500} /><button type="button" className="button secondary compact" disabled={!newItem.trim()} onClick={addItem}><Plus size={14} />{t("addChecklist")}</button></div>
            {checklist.length > 0 && <small className="checklist-note">{t("checklistAuto")}</small>}
          </div>
          <label className="field full range-field"><span>{checklist.length ? t("checklistProgress") : t("completionProgress")} <b>{currentProgress}%</b></span><input type="range" min="0" max="100" step="5" value={currentProgress} disabled={checklist.length > 0 || form.status === "done"} onChange={(e) => set("progress", Number(e.target.value))} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <footer className="dialog-footer">
          {task && onDelete ? confirming ? <div className="delete-confirm"><span>{t("deleteConfirm")}</span><button type="button" className="text-danger" onClick={() => onDelete(task.id)}>{t("confirm")}</button><button type="button" onClick={() => setConfirming(false)}>{t("cancel")}</button></div> : <button type="button" className="delete-button" onClick={() => setConfirming(true)}><Trash2 size={16} />{t("delete")}</button> : <span />}
          <div className="footer-actions"><button type="button" className="button secondary" onClick={close}>{t("cancel")}</button><button className="button primary" type="submit">{t(task ? "saveChanges" : "createWork")}</button></div>
        </footer>
      </form>
    </section>
  </div>;
}
