import { useEffect, useState } from "react";
import { RotateCcw, Trash2, X } from "lucide-react";
import { formatShort, type Task } from "@/lib/tasks";
import { usePreferences } from "@/providers/preferences";

interface Props {
  tasks: Task[];
  pending: boolean;
  onClose: () => void;
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
}

export default function RecycleBinDialog({ tasks, pending, onClose, onRestore, onPurge }: Props) {
  const { language, t } = usePreferences();
  const [confirming, setConfirming] = useState<Task | null>(null);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="dialog recycle-dialog" role="dialog" aria-modal="true" aria-labelledby="recycle-title">
      <header className="dialog-head"><div className="ai-heading"><Trash2 size={22} /><div><span className="overline">RECOVERY</span><h2 id="recycle-title">{t("recycleBin")}</h2></div></div><button className="icon-button" onClick={onClose} aria-label={t("close")}><X size={20} /></button></header>
      <div className="recycle-body">{tasks.length ? <div className="recycle-list">{tasks.map((task) => <article className="recycle-row" key={task.id}>
        <div><span className="project-label">{task.project}</span><h3>{task.title}</h3><small>{formatShort(task.dueDate, language)}</small></div>
        <div className="recycle-actions"><button className="button secondary compact" disabled={pending} onClick={() => onRestore(task.id)}><RotateCcw size={14} />{t("restore")}</button><button className="icon-button small user-delete" disabled={pending} onClick={() => setConfirming(task)} aria-label={`${t("permanentDelete")} ${task.title}`}><Trash2 size={15} /></button></div>
      </article>)}</div> : <div className="recycle-empty"><Trash2 size={27} /><h3>{t("emptyTrash")}</h3><p>{t("emptyTrashHint")}</p></div>}
      {confirming && <div className="user-delete-confirm" role="alert"><p>{t("permanentDeleteConfirm", { title: confirming.title })}</p><div><button className="button secondary compact" onClick={() => setConfirming(null)}>{t("cancel")}</button><button className="button danger compact" onClick={() => { onPurge(confirming.id); setConfirming(null); }}><Trash2 size={14} />{t("confirm")}</button></div></div>}
      </div>
    </section>
  </div>;
}
