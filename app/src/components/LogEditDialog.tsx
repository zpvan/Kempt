import { useEffect, useState } from "react";
import { ArrowRight, NotebookPen, X } from "lucide-react";
import { format } from "date-fns";
import type { Status, Task, WorkLog } from "@/lib/tasks";
import { usePreferences } from "@/providers/preferences";
import { clearDraft, logDraftKey, useDraftState } from "@/lib/drafts";

const statusKeys = { todo: "statusTodo", doing: "statusDoing", done: "statusDone" } as const;

export default function LogEditDialog({ userId, task, log, onClose, onSave }: { userId: string; task: Task; log: WorkLog; onClose: () => void; onSave: (log: WorkLog) => void }) {
  const { t } = usePreferences();
  const draftKey = logDraftKey(userId, log.id);
  const [draft, setDraft, restored] = useDraftState(draftKey, { ...log });
  const [error, setError] = useState("");
  const close = () => { clearDraft(draftKey); onClose(); };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, draftKey]);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (draft.content.trim().length < 2) return setError(t("progressValidation"));
    if (!draft.date) return setError(t("progressDateValidation"));
    onSave({ ...draft, content: draft.content.trim(), progress: draft.status === "done" ? 100 : draft.progress });
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className="dialog progress-dialog" role="dialog" aria-modal="true" aria-labelledby="log-edit-title">
      <header className="dialog-head"><div className="ai-heading"><NotebookPen size={22} /><div><span className="overline">WORK JOURNAL</span><h2 id="log-edit-title">{t("editLog")}</h2></div></div><button className="icon-button" onClick={close} aria-label={t("close")}><X size={20} /></button></header>
      <div className="progress-task-name"><span>{task.project}</span><b>{task.title}</b></div>
      <form onSubmit={submit}><div className="form-body">
        {restored && <p className="draft-restored">{t("draftRestored")}</p>}
        <label className="field"><span>{t("logDate")}</span><input type="date" value={draft.date} max={format(new Date(), "yyyy-MM-dd")} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
        <label className="field"><span>{t("currentStatus")}</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Status })}>{(["todo", "doing", "done"] as Status[]).map((key) => <option value={key} key={key}>{t(statusKeys[key])}</option>)}</select></label>
        <label className="field full"><span>{t("logContent")}</span><textarea autoFocus rows={4} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} maxLength={1000} /></label>
        <label className="field full range-field"><span>{t("completionProgress")} <b>{draft.status === "done" ? 100 : draft.progress}%</b></span><input type="range" min="0" max="100" step="5" value={draft.status === "done" ? 100 : draft.progress} disabled={draft.status === "done"} onChange={(event) => setDraft({ ...draft, progress: Number(event.target.value) })} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div><footer className="dialog-footer"><span /><div className="footer-actions"><button type="button" className="button secondary" onClick={close}>{t("cancel")}</button><button className="button primary" type="submit">{t("saveLog")}<ArrowRight size={16} /></button></div></footer></form>
    </section>
  </div>;
}
