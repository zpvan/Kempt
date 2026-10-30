import { useEffect, useState } from "react";
import { X, NotebookPen, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { checklistProgress, type Status, type Task, type WorkLog } from "@/lib/tasks";
import { usePreferences } from "@/providers/preferences";
import { clearDraft, progressDraftKey, useDraftState } from "@/lib/drafts";

const statusKeys = { todo: "statusTodo", doing: "statusDoing", done: "statusDone" } as const;

interface Props {
  userId: string;
  task: Task;
  onClose: () => void;
  onSave: (taskId: string, log: WorkLog) => void;
}

export default function ProgressDialog({ userId, task, onClose, onSave }: Props) {
  const { t } = usePreferences();
  const draftKey = progressDraftKey(userId, task.id);
  const [draft, setDraft, restored] = useDraftState(draftKey, { date: format(new Date(), "yyyy-MM-dd"), content: "", progress: task.progress, status: task.status });
  const { date, content, progress, status } = draft;
  const setDate = (value: string) => setDraft({ ...draft, date: value });
  const setContent = (value: string) => setDraft({ ...draft, content: value });
  const setProgress = (value: number) => setDraft({ ...draft, progress: value });
  const setStatus = (value: Status) => setDraft({ ...draft, status: value });
  const [error, setError] = useState("");
  const hasChecklist = (task.checklist?.length || 0) > 0;
  const derivedProgress = hasChecklist ? checklistProgress(task.checklist) : progress;
  const close = () => { clearDraft(draftKey); onClose(); };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, draftKey]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim().length < 2) return setError(t("progressValidation"));
    if (!date) return setError(t("progressDateValidation"));
    onSave(task.id, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, date, content: content.trim(), progress: status === "done" ? 100 : derivedProgress, status, createdAt: Date.now() });
  };
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
    <section className="dialog progress-dialog" role="dialog" aria-modal="true" aria-labelledby="progress-title">
      <header className="dialog-head"><div className="ai-heading"><NotebookPen size={22} /><div><span className="overline">PROGRESS UPDATE</span><h2 id="progress-title">{t("recordWorkProgress")}</h2></div></div><button className="icon-button" onClick={close} aria-label={t("close")}><X size={20} /></button></header>
      <div className="progress-task-name"><span>{task.project}</span><b>{task.title}</b><small>{t("existingLogs", { count: task.logs?.length || 0 })}</small></div>
      <form onSubmit={submit}>
        <div className="form-body">
          {restored && <p className="draft-restored">{t("draftRestored")}</p>}
          <label className="field"><span>{t("progressDate")}</span><input type="date" value={date} max={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field"><span>{t("updatedStatus")}</span><select value={status} onChange={(e) => setStatus(e.target.value as Status)}>{(["todo", "doing", "done"] as Status[]).map((key) => <option value={key} key={key}>{t(statusKeys[key])}</option>)}</select></label>
          <label className="field full"><span>{t("progressQuestion")}</span><textarea autoFocus rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder={t("progressPlaceholder")} maxLength={1000} /></label>
          <label className="field full range-field"><span>{hasChecklist ? t("checklistProgress") : t("updatedProgress")} <b>{status === "done" ? 100 : derivedProgress}%</b></span><input type="range" min="0" max="100" step="5" value={status === "done" ? 100 : derivedProgress} disabled={hasChecklist || status === "done"} onChange={(e) => setProgress(Number(e.target.value))} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <footer className="dialog-footer"><span className="ai-note">{t("progressFooterNote")}</span><div className="footer-actions"><button type="button" className="button secondary" onClick={close}>{t("cancel")}</button><button className="button primary" type="submit">{t("saveProgress")}<ArrowRight size={16} /></button></div></footer>
      </form>
    </section>
  </div>;
}
