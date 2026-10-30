import { useState } from "react";
import { format, parseISO } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { BookOpenText, ChevronRight, Columns3, Edit3, NotebookPen, Trash2 } from "lucide-react";
import { type Task, type WorkLog } from "@/lib/tasks";
import { usePreferences } from "@/providers/preferences";

const statusKeys = { todo: "statusTodo", doing: "statusDoing", done: "statusDone" } as const;
type LogEntry = WorkLog & { task: Task };

export default function LogsView({ tasks, query, onEdit, onBoard, onEditLog, onDeleteLog }: { tasks: Task[]; query: string; onEdit: (task: Task) => void; onBoard: () => void; onEditLog: (task: Task, log: WorkLog) => void; onDeleteLog: (id: string) => void }) {
  const { language, t } = usePreferences();
  const [confirming, setConfirming] = useState<string | null>(null);
  const locale = language === "zh" ? zhCN : enUS;
  const entries: LogEntry[] = tasks.flatMap((task) => (task.logs || []).map((log) => ({ ...log, task })))
    .filter((entry) => !query || `${entry.task.title}${entry.task.project}${entry.content}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const groups = entries.reduce<Record<string, LogEntry[]>>((acc, entry) => {
    (acc[entry.date] ||= []).push(entry);
    return acc;
  }, {});
  return <div className="logs-layout">
    <section className="logs-summary glass-panel"><div><span className="overline">WORK JOURNAL</span><h2>{t("journalTitle")}</h2><p>{t("journalDesc")}</p></div><div className="log-stat"><BookOpenText size={21} /><span><b>{entries.length}</b><small>{t("progressEntries")}</small></span></div></section>
    {entries.length ? <div className="timeline">{Object.entries(groups).map(([date, logs]) => <section className="timeline-day" key={date}>
      <header className="timeline-date"><time>{format(parseISO(date), language === "zh" ? "M月d日 EEEE" : "EEE, MMM d", { locale })}</time><span>{format(parseISO(date), language === "zh" ? "yyyy年" : "yyyy", { locale })}</span><i /></header>
      <div className="timeline-entries">{logs.map((log) => <article className="log-entry" key={log.id}>
        <div className="log-entry-head"><button onClick={() => onEdit(log.task)}><span className="project-label">{log.task.project}</span><h3>{log.task.title}</h3><ChevronRight size={16} /></button><div className="log-snapshot"><span className={`log-status ${log.status}`}>{t(statusKeys[log.status])}</span><b>{log.progress}%</b></div></div>
        <p>{log.content}</p>
        <footer><NotebookPen size={13} /><span>{t("recordedAt", { date: format(new Date(log.createdAt), language === "zh" ? "yyyy年M月d日 HH:mm" : "MMM d, yyyy HH:mm", { locale }) })}</span><span className="log-entry-actions"><button onClick={() => onEditLog(log.task, log)} aria-label={t("editLog")}><Edit3 size={13} />{t("editLog")}</button><button className="delete-log" onClick={() => setConfirming(log.id)} aria-label={t("deleteLog")}><Trash2 size={13} />{t("deleteLog")}</button></span></footer>
        {confirming === log.id && <div className="user-delete-confirm log-delete-confirm" role="alert"><p>{t("deleteLogConfirm")}</p><div><button className="button secondary compact" onClick={() => setConfirming(null)}>{t("cancel")}</button><button className="button danger compact" onClick={() => { onDeleteLog(log.id); setConfirming(null); }}><Trash2 size={14} />{t("confirm")}</button></div></div>}
      </article>)}</div>
    </section>)}</div> : <div className="logs-empty glass-panel"><BookOpenText size={30} /><h2>{t("noLogs")}</h2><p>{t("noLogsHint")}</p><button className="button primary" onClick={onBoard}><Columns3 size={17} />{t("goBoardLogs")}</button></div>}
  </div>;
}
