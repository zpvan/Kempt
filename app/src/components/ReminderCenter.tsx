import { useEffect, useState } from "react";
import { Bell, BellRing, Check, ChevronRight, Clock3, X } from "lucide-react";
import { differenceInCalendarDays, format, startOfDay } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import type { Task } from "@/lib/tasks";
import { translate, type Language } from "@/lib/i18n";
import { usePreferences } from "@/providers/preferences";

export const reminderLabel = (task: Task, language: Language = "zh") => {
  const days = differenceInCalendarDays(new Date(`${task.dueDate}T12:00:00`), startOfDay(new Date()));
  if (days < 0) return translate(language, "overdueDays", { count: Math.abs(days) });
  if (days === 0) return translate(language, "dueToday");
  return translate(language, "dueInDays", { count: days });
};

export function dueSoonTasks(tasks: Task[]) {
  const today = startOfDay(new Date());
  return tasks.filter((task) => task.status !== "done" && differenceInCalendarDays(new Date(`${task.dueDate}T12:00:00`), today) <= 3)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

interface Props {
  tasks: Task[];
  onClose: () => void;
  onEdit: (task: Task) => void;
  onComplete: (id: string) => void;
}

export default function ReminderCenter({ tasks, onClose, onEdit, onComplete }: Props) {
  const { language, t } = usePreferences();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => "Notification" in window ? Notification.permission : "unsupported");
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  const enableNotifications = async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };
  return <section className="reminder-panel" role="dialog" aria-label={t("deadlineReminders")}>
    <header><div><span className="overline">REMINDERS</span><h2>{t("deadlineReminders")}</h2></div><button className="icon-button small" onClick={onClose} aria-label={t("closeReminders")}><X size={18} /></button></header>
    <div className="reminder-rule"><Clock3 size={15} /><span>{t("reminderRule")}</span></div>
    <div className="reminder-list">{tasks.length ? tasks.map((task) => <div className="reminder-item" key={task.id}>
      <button className="reminder-main" onClick={() => { onEdit(task); onClose(); }}><span><b>{task.title}</b><small>{format(new Date(`${task.dueDate}T12:00:00`), language === "zh" ? "yyyy年M月d日" : "MMM d, yyyy", { locale: language === "zh" ? zhCN : enUS })} · {task.project}</small></span><ChevronRight size={16} /></button>
      <div><span className={differenceInCalendarDays(new Date(`${task.dueDate}T12:00:00`), startOfDay(new Date())) < 0 ? "reminder-date overdue" : "reminder-date"}>{reminderLabel(task, language)}</span><button className="complete-link" onClick={() => onComplete(task.id)}><Check size={13} />{t("markDone")}</button></div>
    </div>) : <div className="reminder-empty"><Bell size={24} /><b>{t("noReminders")}</b><span>{t("noRemindersHint")}</span></div>}</div>
    <footer>{permission === "granted" ? <span className="notification-status enabled"><BellRing size={15} />{t("notificationsEnabled")}</span> : permission === "unsupported" ? <span className="notification-status">{t("notificationsUnsupported")}</span> : <button className="button secondary compact" onClick={enableNotifications}><BellRing size={15} />{t(permission === "denied" ? "notificationsBlocked" : "enableNotifications")}</button>}<small>{t("notificationsClosedNote")}</small></footer>
  </section>;
}
