import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, isBefore, startOfDay } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { LayoutDashboard, Columns3, ChartGantt, Plus, Search, CheckCircle2, ListTodo, TimerReset, Cloud, X, Bell, NotebookText, Database, Server, RefreshCw, Languages, Moon, Sun, UsersRound, FolderKanban, Bot } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import TaskDialog from "@/components/TaskDialog";
import ProgressDialog from "@/components/ProgressDialog";
import LogsView from "@/components/LogsView";
import DataDialog from "@/components/DataDialog";
import UserDialog from "@/components/UserDialog";
import RecycleBinDialog from "@/components/RecycleBinDialog";
import ProjectsView from "@/components/ProjectsView";
import LogEditDialog from "@/components/LogEditDialog";
import AssistantPanel from "@/components/AssistantPanel";
import { BoardView, FocusView, GanttView } from "@/components/Views";
import ReminderCenter, { dueSoonTasks, reminderLabel } from "@/components/ReminderCenter";
import { overallProgress, uid, type Status, type Task, type WorkLog } from "@/lib/tasks";
import type { AppUser } from "@contracts/types";
import { usePreferences } from "@/providers/preferences";
import { clearDraft, logDraftKey, progressDraftKey, taskDraftKey, taskItemsDraftKey } from "@/lib/drafts";
import { useRpcMutation, useRpcQuery } from "@/services/rpc";
import { useWorkspaceService } from "@/services/provider";
import { legacyLocalMigration } from "@/services/legacyLocal";
import "./App.css";

type View = "focus" | "board" | "projects" | "gantt" | "logs";
const navItems: { id: View; icon: typeof LayoutDashboard }[] = [
  { id: "focus", icon: LayoutDashboard },
  { id: "board", icon: Columns3 },
  { id: "projects", icon: FolderKanban },
  { id: "gantt", icon: ChartGantt },
  { id: "logs", icon: NotebookText },
];

const queryKey = (method: string, payload: unknown = {}) => ["rpc", method, JSON.stringify(payload)];

export default function App() {
  const { theme, language, toggleTheme, toggleLanguage, t } = usePreferences();
  const service = useWorkspaceService();
  const queryClient = useQueryClient();
  const migrationAttempted = useRef(false);
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem("kempt.currentUser") || "shella");
  const [view, setView] = useState<View>("board");
  const [editing, setEditing] = useState<Task | null | undefined>(undefined);
  const [progressTask, setProgressTask] = useState<Task | null>(null);
  const [newStatus, setNewStatus] = useState<Status>("todo");
  const [dataOpen, setDataOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<{ task: Task; log: WorkLog } | null>(null);
  const [lastDeleted, setLastDeleted] = useState<string | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("all");
  const [toast, setToast] = useState("");
  const usersQuery = useRpcQuery<AppUser[]>("user.list");
  const users = usersQuery.data ?? [];
  const activeUserId = users.some((user) => user.id === currentUser) ? currentUser : users[0]?.id ?? "shella";
  const activeUser = users.find((user) => user.id === activeUserId);
  const tasksQuery = useRpcQuery<Task[]>("task.list", { userId: activeUserId }, usersQuery.isSuccess);
  const trashQuery = useRpcQuery<Task[]>("task.trash", { userId: activeUserId }, trashOpen && usersQuery.isSuccess);
  const tasks = tasksQuery.data ?? [];
  const applyTasks = (next: Task[]) => queryClient.setQueryData(queryKey("task.list", { userId: activeUserId }), next);
  const applyUsers = (next: AppUser[]) => queryClient.setQueryData(queryKey("user.list"), next);
  const applyTrash = (next: Task[]) => queryClient.setQueryData(queryKey("task.trash", { userId: activeUserId }), next);
  const mutationError = (error: { message: string }) => setToast(t("syncError", { message: error.message }));
  const userMutationError = (error: { message: string }) => setToast(t("userError", { message: error.message }));
  const upsert = useRpcMutation<{ userId: string; task: Task }, Task[]>("task.upsert");
  const remove = useRpcMutation<{ userId: string; id: string }, Task[]>("task.delete");
  const statusMutation = useRpcMutation<{ userId: string; id: string; status: Status }, Task[]>("task.setStatus");
  const logMutation = useRpcMutation<{ userId: string; taskId: string; log: WorkLog }, Task[]>("task.addLog");
  const restoreMutation = useRpcMutation<{ userId: string; id: string }, Task[]>("task.restore");
  const reorderMutation = useRpcMutation<{ userId: string; orderedIds: string[] }, Task[]>("task.reorder");
  const purgeMutation = useRpcMutation<{ userId: string; id: string }, Task[]>("task.purge");
  const updateLogMutation = useRpcMutation<{ userId: string; log: WorkLog }, Task[]>("task.updateLog");
  const deleteLogMutation = useRpcMutation<{ userId: string; id: string }, Task[]>("task.deleteLog");
  const createUserMutation = useRpcMutation<{ name: string }, { user: AppUser; users: AppUser[] }>("user.create");
  const deleteUserMutation = useRpcMutation<{ id: string }, AppUser[]>("user.delete");
  const syncing = tasksQuery.isFetching || upsert.isPending || remove.isPending || statusMutation.isPending || logMutation.isPending || restoreMutation.isPending || reorderMutation.isPending || purgeMutation.isPending || updateLogMutation.isPending || deleteLogMutation.isPending;

  useEffect(() => {
    if (migrationAttempted.current) return;
    migrationAttempted.current = true;
    legacyLocalMigration(service)
      .then(() => queryClient.invalidateQueries({ queryKey: ["rpc"] }))
      .catch((reason: unknown) => mutationError(reason instanceof Error ? reason : new Error(String(reason))));
  }, [service, queryClient]);
  useEffect(() => { localStorage.setItem("kempt.currentUser", activeUserId); }, [activeUserId]);
  useEffect(() => { if (usersQuery.data && !usersQuery.data.some((user) => user.id === currentUser)) setCurrentUser(usersQuery.data[0]?.id || "shella"); }, [usersQuery.data, currentUser]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => { setToast(""); setLastDeleted(null); }, lastDeleted ? 6500 : 3200); return () => clearTimeout(timer); }, [toast, lastDeleted]);
  const projects = useMemo(() => Array.from(new Set(tasks.map((task) => task.project))), [tasks]);
  const reminders = useMemo(() => dueSoonTasks(tasks), [tasks]);
  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted" || !reminders.length) return;
    const dayKey = format(new Date(), "yyyy-MM-dd");
    let sent: string[] = [];
    try { sent = JSON.parse(localStorage.getItem("kempt.notifications") || "[]"); } catch { sent = []; }
    const fresh = reminders.filter((task) => !sent.includes(`${dayKey}:${task.id}`));
    fresh.forEach((task) => new Notification(t("notificationTitle"), { body: `${task.title} · ${reminderLabel(task, language)}` }));
    if (fresh.length) localStorage.setItem("kempt.notifications", JSON.stringify([...sent, ...fresh.map((task) => `${dayKey}:${task.id}`)].slice(-80)));
  }, [reminders, language, t]);
  const filtered = useMemo(() => tasks.filter((task) => (project === "all" || task.project === project) && (!search || `${task.title}${task.description}${task.project}${(task.logs || []).map((log) => log.content).join("")}`.toLowerCase().includes(search.toLowerCase()))), [tasks, project, search]);
  const done = tasks.filter((task) => task.status === "done").length;
  const doing = tasks.filter((task) => task.status === "doing").length;
  const overdue = tasks.filter((task) => task.status !== "done" && isBefore(new Date(`${task.dueDate}T23:59:59`), startOfDay(new Date()))).length;

  const saveTask = (data: Omit<Task, "id" | "createdAt">, id?: string) => {
    const original = id ? tasks.find((task) => task.id === id) : undefined;
    const task: Task = { ...data, id: id ?? uid(), createdAt: original?.createdAt ?? Date.now(), position: original?.position ?? 0, logs: original?.logs };
    upsert.mutate({ userId: activeUserId, task }, {
      onSuccess: (next) => {
        applyTasks(next);
        clearDraft(taskDraftKey(activeUserId, id ?? "new"), taskItemsDraftKey(activeUserId, id ?? "new"));
        setEditing(undefined);
        setToast(t(id ? "editSynced" : "createSynced"));
      },
      onError: mutationError,
    });
  };
  const moveTaskDates = (task: Task, offset: number) => {
    const shift = (date: string) => format(addDays(new Date(`${date}T12:00:00`), offset), "yyyy-MM-dd");
    const moved = { ...task, startDate: shift(task.startDate), dueDate: shift(task.dueDate) };
    upsert.mutate({ userId: activeUserId, task: moved }, { onSuccess: applyTasks, onError: mutationError });
  };
  const openNew = (status: Status = "todo") => { setNewStatus(status); setEditing(null); };
  const saveWorkLog = (taskId: string, log: WorkLog) => {
    logMutation.mutate({ userId: activeUserId, taskId, log }, {
      onSuccess: (next) => {
        applyTasks(next);
        clearDraft(progressDraftKey(activeUserId, taskId));
        setProgressTask(null);
        setToast(t("progressSynced"));
      },
      onError: mutationError,
    });
  };
  const updateStatus = (id: string, status: Status) => {
    if (!id) return;
    statusMutation.mutate({ userId: activeUserId, id, status }, {
      onSuccess: (next) => { applyTasks(next); setToast(t(status === "done" ? "doneSynced" : "statusSynced")); },
      onError: mutationError,
    });
  };
  const reorderTasks = (orderedIds: string[]) => {
    const positions = new Map(orderedIds.map((id, index) => [id, (index + 1) * 100]));
    applyTasks([...tasks].map((task) => positions.has(task.id) ? { ...task, position: positions.get(task.id) } : task).sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || b.createdAt - a.createdAt));
    reorderMutation.mutate({ userId: activeUserId, orderedIds }, { onSuccess: applyTasks, onError: mutationError });
  };
  const deleteTask = (id: string) => {
    remove.mutate({ userId: activeUserId, id }, {
      onSuccess: (next) => { applyTasks(next); setEditing(undefined); setLastDeleted(id); setToast(t("taskMovedTrash")); },
      onError: mutationError,
    });
  };
  const restoreTask = (id: string) => {
    restoreMutation.mutate({ userId: activeUserId, id }, {
      onSuccess: (next) => { applyTasks(next); setLastDeleted(null); setToast(t("taskRestored")); void trashQuery.refetch(); },
      onError: mutationError,
    });
  };
  const purgeTask = (id: string) => {
    purgeMutation.mutate({ userId: activeUserId, id }, { onSuccess: (remaining) => { applyTrash(remaining); setToast(t("taskPurged")); }, onError: mutationError });
  };
  const saveEditedLog = (log: WorkLog) => {
    updateLogMutation.mutate({ userId: activeUserId, log }, {
      onSuccess: (next) => { applyTasks(next); clearDraft(logDraftKey(activeUserId, log.id)); setEditingLog(null); setToast(t("logUpdated")); },
      onError: mutationError,
    });
  };
  const deleteLog = (id: string) => {
    deleteLogMutation.mutate({ userId: activeUserId, id }, { onSuccess: (next) => { applyTasks(next); setToast(t("logDeleted")); }, onError: mutationError });
  };
  const switchUser = (user: AppUser) => {
    setCurrentUser(user.id);
    setUserOpen(false);
    setProject("all");
    setSearch("");
    setToast(t("userSwitched", { name: user.name }));
  };
  const addUser = (name: string) => {
    createUserMutation.mutate({ name }, {
      onSuccess: ({ user, users: nextUsers }) => {
        applyUsers(nextUsers);
        setCurrentUser(user.id);
        setUserOpen(false);
        setToast(t("userCreated", { name: user.name }));
      },
      onError: userMutationError,
    });
  };
  const deleteUser = (user: AppUser) => {
    deleteUserMutation.mutate({ id: user.id }, {
      onSuccess: (nextUsers) => {
        applyUsers(nextUsers);
        if (activeUserId === user.id) setCurrentUser(nextUsers[0]?.id || "shella");
        setToast(t("userDeleted", { name: user.name }));
      },
      onError: userMutationError,
    });
  };

  if (usersQuery.isLoading || tasksQuery.isLoading) {
    return <div className="server-gate"><div className="server-state glass-panel"><Server size={30} /><h1>{t("loadingTitle")}</h1><p>{t("loadingDesc")}</p></div></div>;
  }
  if (usersQuery.error || tasksQuery.error) {
    const error = usersQuery.error ?? tasksQuery.error;
    return <div className="server-gate"><div className="server-state glass-panel"><Server size={30} /><h1>{t("readError")}</h1><p>{error?.message}</p><button className="button primary" onClick={() => { void usersQuery.refetch(); void tasksQuery.refetch(); }}><RefreshCw size={16} />{t("retry")}</button></div></div>;
  }

  return <div className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" /><div className="noise" />
    <aside className="sidebar glass-panel">
      <button className="brand" onClick={() => setView("focus")} aria-label={t("backToday")}><span className="brand-mark"><i /><i /><i /></span><span className="brand-name">{language === "zh" ? "Kempt" : "Kempt"}</span></button>
      <nav className="main-nav" aria-label={t("mainNavigation")}>{navItems.map(({ id, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon size={20} /><span>{t(id === "focus" ? "today" : id)}</span></button>)}</nav>
      <div className="sidebar-foot"><Cloud size={16} /><span>{t(syncing ? "syncingServer" : "syncedBackup")}</span></div>
    </aside>
    <main className="workspace">
      <header className="topbar">
        <div className="greeting"><span>{format(new Date(), language === "zh" ? "M月d日 EEEE" : "EEE, MMM d", { locale: language === "zh" ? zhCN : enUS })}</span></div>
        <div className="top-actions">
          <button className={`reminder-button ${reminders.length ? "has-reminders" : ""}`} onClick={() => setReminderOpen(!reminderOpen)} aria-label={t("remindersAria", { count: reminders.length })}><Bell size={19} />{reminders.length > 0 && <span>{reminders.length}</span>}</button>
          <label className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("searchWork")} aria-label={t("searchWork")} />{search && <button onClick={() => setSearch("")} aria-label={t("clearSearch")}><X size={15} /></button>}</label>
          <button className="assistant-button" onClick={() => setAssistantOpen(true)} aria-label={t("assistant")} title={t("assistant")}><Bot size={19} /></button>
          <button className="user-button" onClick={() => setUserOpen(true)} aria-label={t("userManagement")}><UsersRound size={17} /><span>{activeUser?.name ?? "shella"}</span></button>
          <div className="preference-controls">
            <button className="icon-button preference-button" onClick={toggleTheme} aria-label={t(theme === "light" ? "switchDark" : "switchLight")} title={t(theme === "light" ? "switchDark" : "switchLight")}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button>
            <button className="language-button" onClick={toggleLanguage} aria-label={t(language === "zh" ? "switchEnglish" : "switchChinese")} title={t(language === "zh" ? "switchEnglish" : "switchChinese")}><Languages size={18} /></button>
          </div>
          <button className="button data-button" onClick={() => setDataOpen(true)} aria-label={t("importExport")} title={t("importExport")}><Database size={18} /></button>
          <button className="button primary new-button" onClick={() => openNew()}><Plus size={18} /><span>{t("newWork")}</span></button>
        </div>
      </header>
      <section className="overview-strip">
        <button onClick={() => { setView("board"); setProject("all"); }}><span className="stat-icon blue"><ListTodo size={18} /></span><span><b>{tasks.length}</b><small>{t("allWork")}</small></span></button>
        <button onClick={() => { setView("board"); setProject("all"); }}><span className="stat-icon orange"><TimerReset size={18} /></span><span><b>{doing}</b><small>{t("inProgress")}</small></span></button>
        <button onClick={() => { setView("board"); setProject("all"); }}><span className="stat-icon green"><CheckCircle2 size={18} /></span><span><b>{done}</b><small>{t("completed")}</small></span></button>
        <div className="completion-stat"><div><span>{t("overallProgress")}</span><b>{overallProgress(tasks)}%</b></div><div className="overview-progress"><i style={{ width: `${overallProgress(tasks)}%` }} /></div></div>
        {overdue > 0 && <span className="overdue-note">{t("overdueCount", { count: overdue })}</span>}
      </section>
      <div className="content-toolbar"><div className="mobile-view-tabs">{navItems.map(({ id }) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{t(id === "focus" ? "today" : id)}</button>)}</div><div className="view-copy"><h2>{view === "focus" ? t("yourWorkspace") : view === "board" ? t("boardSubheading") : view === "logs" ? t("workJournal") : view === "projects" ? t("projectOverview") : t("projectTimeline")}</h2><span>{t("workItems", { count: filtered.length })}{search && ` · “${search}”`}</span></div><select value={project} onChange={(event) => setProject(event.target.value)} aria-label={t("projectFilter")}><option value="all">{t("allProjects")}</option>{projects.map((name) => <option value={name} key={name}>{name}</option>)}</select></div>
      <div className="view-container">
        {view === "focus" && <FocusView tasks={filtered} onEdit={setEditing} onUpdate={setProgressTask} onBoard={() => setView("board")} onReorder={reorderTasks} />}
        {view === "board" && <BoardView tasks={filtered} onEdit={setEditing} onUpdate={setProgressTask} onStatus={updateStatus} onNew={openNew} onReorder={reorderTasks} />}
        {view === "projects" && <ProjectsView tasks={filtered} onOpenProject={(name) => { setProject(name); setView("board"); }} />}
        {view === "gantt" && <GanttView tasks={filtered} onEdit={setEditing} onMove={moveTaskDates} />}
        {view === "logs" && <LogsView tasks={filtered} query={search} onEdit={setEditing} onBoard={() => setView("board")} onEditLog={(task, log) => setEditingLog({ task, log })} onDeleteLog={deleteLog} />}
      </div>
      <footer className="workspace-footer"><span>{t("footerSlogan")}</span><span>{t(syncing ? "syncingChanges" : "syncedFooter")}</span></footer>
    </main>
    {reminderOpen && <ReminderCenter tasks={reminders} onClose={() => setReminderOpen(false)} onEdit={setEditing} onComplete={(id) => updateStatus(id, "done")} />}
    {editing !== undefined && <TaskDialog key={editing?.id ?? `new-${newStatus}`} userId={activeUserId} task={editing} defaultStatus={newStatus} onClose={() => setEditing(undefined)} onSave={saveTask} onDelete={editing ? deleteTask : undefined} onUpdate={(task) => { setEditing(undefined); setProgressTask(task); }} />}
    {dataOpen && <DataDialog userId={activeUserId} onClose={() => setDataOpen(false)} onOpenTrash={() => { setDataOpen(false); setTrashOpen(true); }} />}
    {trashOpen && <RecycleBinDialog tasks={trashQuery.data ?? []} pending={restoreMutation.isPending || purgeMutation.isPending} onClose={() => setTrashOpen(false)} onRestore={restoreTask} onPurge={purgeTask} />}
    {editingLog && <LogEditDialog userId={activeUserId} task={editingLog.task} log={editingLog.log} onClose={() => setEditingLog(null)} onSave={saveEditedLog} />}
    {userOpen && <UserDialog users={users} currentUserId={activeUserId} creating={createUserMutation.isPending} deleting={deleteUserMutation.isPending} onClose={() => setUserOpen(false)} onSwitch={switchUser} onCreate={addUser} onDelete={deleteUser} />}
    {progressTask && <ProgressDialog userId={activeUserId} task={progressTask} onClose={() => setProgressTask(null)} onSave={saveWorkLog} />}
    {assistantOpen && <AssistantPanel workspaceId={activeUserId} onClose={() => setAssistantOpen(false)} onTasks={applyTasks} />}
    {toast && <div className="toast" role="status"><CheckCircle2 size={18} /><span>{toast}</span>{lastDeleted && <button onClick={() => restoreTask(lastDeleted)}>{t("undo")}</button>}</div>}
  </div>;
}
