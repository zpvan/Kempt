import { useEffect, useMemo, useState } from "react";
import { addDays, format, isBefore, startOfDay } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { LayoutDashboard, Columns3, ChartGantt, Plus, Search, CheckCircle2, ListTodo, TimerReset, Cloud, X, Bell, NotebookText, Database, Server, RefreshCw, Languages, Moon, Sun, UsersRound, FolderKanban, Bot } from "lucide-react";
import TaskDialog from "@/components/TaskDialog";
import ProgressDialog from "@/components/ProgressDialog";
import LogsView from "@/components/LogsView";
import DataDialog from "@/components/DataDialog";
import UserDialog from "@/components/UserDialog";
import RecycleBinDialog from "@/components/RecycleBinDialog";
import ProjectsView from "@/components/ProjectsView";
import LogEditDialog from "@/components/LogEditDialog";
import SecurityDialog from "@/components/SecurityDialog";
import AssistantPanel from "@/components/AssistantPanel";
import Login from "@/pages/Login";
import { useAuth } from "@/hooks/useAuth";
import { BoardView, FocusView, GanttView } from "@/components/Views";
import ReminderCenter, { dueSoonTasks, reminderLabel } from "@/components/ReminderCenter";
import { overallProgress, parseTaskImport, uid, type Status, type Task, type WorkLog } from "@/lib/tasks";
import { trpc } from "@/providers/trpc";
import type { AppUser } from "@contracts/types";
import { usePreferences } from "@/providers/preferences";
import { clearDraft, logDraftKey, progressDraftKey, taskDraftKey, taskItemsDraftKey } from "@/lib/drafts";
import "./App.css";

type View = "focus" | "board" | "projects" | "gantt" | "logs";
const navItems: { id: View; icon: typeof LayoutDashboard }[] = [
  { id: "focus", icon: LayoutDashboard },
  { id: "board", icon: Columns3 },
  { id: "projects", icon: FolderKanban },
  { id: "gantt", icon: ChartGantt },
  { id: "logs", icon: NotebookText },
];

type TaskCache = Record<string, Task[]>;
function loadTaskCache(ownerKey?: string): TaskCache {
  if (!ownerKey) return {};
  try {
    const saved = localStorage.getItem(`kempt.tasks.users.v1.${ownerKey}`);
    if (saved) {
      const raw = JSON.parse(saved) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(raw).flatMap(([userId, value]) => {
        try { return [[userId, parseTaskImport(value)] as const]; } catch { return []; }
      }));
    }
  } catch { /* Ignore an invalid account cache and load from the server. */ }
  return {};
}

const LOCAL_TASKS_KEY = "kempt.local.tasks.v1";
const LOCAL_TRASH_KEY = "kempt.local.trash.v1";
function loadLocalTasks(): Task[] {
  try { const saved = localStorage.getItem(LOCAL_TASKS_KEY); return saved ? parseTaskImport(JSON.parse(saved)) : []; } catch { return []; }
}
function loadLocalTrash(): Task[] {
  try { const saved = localStorage.getItem(LOCAL_TRASH_KEY); return saved ? parseTaskImport(JSON.parse(saved)) : []; } catch { return []; }
}

export default function App() {
  const { theme, language, toggleTheme, toggleLanguage, t } = usePreferences();
  const { user: authUser, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const [localMode, setLocalMode] = useState(() => localStorage.getItem("kempt.localMode") === "1");
  const [tasksByUser, setTasksByUser] = useState<TaskCache>(loadTaskCache);
  const [localTasks, setLocalTasks] = useState<Task[]>(loadLocalTasks);
  const [localTrash, setLocalTrash] = useState<Task[]>(loadLocalTrash);
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem("kempt.currentUser") || "shella");
  const [view, setView] = useState<View>("board");
  const [editing, setEditing] = useState<Task | null | undefined>(undefined);
  const [progressTask, setProgressTask] = useState<Task | null>(null);
  const [newStatus, setNewStatus] = useState<Status>("todo");
  const [dataOpen, setDataOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<{ task: Task; log: WorkLog } | null>(null);
  const [lastDeleted, setLastDeleted] = useState<string | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("all");
  const [toast, setToast] = useState("");
  const utils = trpc.useUtils();
  const usersQuery = trpc.user.list.useQuery(undefined, { enabled: isAuthenticated });
  const users = usersQuery.data ?? [];
  const isLocalMode = localMode && !isAuthenticated;
  const activeUserId = isLocalMode ? "local" : users.some((user) => user.id === currentUser) ? currentUser : users[0]?.id ?? "shella";
  const activeUser = users.find((user) => user.id === activeUserId);
  const tasks = isLocalMode ? localTasks : tasksByUser[activeUserId] ?? [];
  const accountKey = authUser?.unionId;
  useEffect(() => {
    setTasksByUser(loadTaskCache(accountKey));
    if (accountKey) setCurrentUser(localStorage.getItem(`kempt.currentUser.${accountKey}`) || "shella");
  }, [accountKey]);
  const tasksQuery = trpc.task.list.useQuery({ userId: activeUserId }, { enabled: !isLocalMode && isAuthenticated && usersQuery.isSuccess });
  const trashQuery = trpc.task.trash.useQuery({ userId: activeUserId }, { enabled: !isLocalMode && isAuthenticated && trashOpen && usersQuery.isSuccess });
  const applyTasks = (next: Task[]) => { if (isLocalMode) setLocalTasks(next); else setTasksByUser((cache) => ({ ...cache, [activeUserId]: next })); };
  const mutationError = (error: { message: string }) => setToast(t("syncError", { message: error.message }));
  const userMutationError = (error: { message: string }) => setToast(t("userError", { message: error.message }));
  const upsert = trpc.task.upsert.useMutation({ onSuccess: applyTasks, onError: mutationError });
  const remove = trpc.task.delete.useMutation({ onSuccess: applyTasks, onError: mutationError });
  const statusMutation = trpc.task.setStatus.useMutation({ onSuccess: applyTasks, onError: mutationError });
  const logMutation = trpc.task.addLog.useMutation({ onSuccess: applyTasks, onError: mutationError });
  const restoreMutation = trpc.task.restore.useMutation({ onSuccess: applyTasks, onError: mutationError });
  const reorderMutation = trpc.task.reorder.useMutation({ onSuccess: applyTasks, onError: mutationError });
  const purgeMutation = trpc.task.purge.useMutation({ onError: mutationError });
  const updateLogMutation = trpc.task.updateLog.useMutation({ onSuccess: applyTasks, onError: mutationError });
  const deleteLogMutation = trpc.task.deleteLog.useMutation({ onSuccess: applyTasks, onError: mutationError });
  const createUserMutation = trpc.user.create.useMutation({ onError: userMutationError });
  const deleteUserMutation = trpc.user.delete.useMutation({ onError: userMutationError });
  const syncing = isLocalMode ? false : tasksQuery.isFetching || upsert.isPending || remove.isPending || statusMutation.isPending || logMutation.isPending || restoreMutation.isPending || reorderMutation.isPending || purgeMutation.isPending || updateLogMutation.isPending || deleteLogMutation.isPending;
  useEffect(() => { if (accountKey) localStorage.setItem(`kempt.tasks.users.v1.${accountKey}`, JSON.stringify(tasksByUser)); }, [tasksByUser, accountKey]);
  useEffect(() => { if (accountKey) localStorage.setItem(`kempt.currentUser.${accountKey}`, activeUserId); }, [activeUserId, accountKey]);
  useEffect(() => { localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(localTasks)); }, [localTasks]);
  useEffect(() => { localStorage.setItem(LOCAL_TRASH_KEY, JSON.stringify(localTrash)); }, [localTrash]);
  useEffect(() => { if (usersQuery.data && !usersQuery.data.some((user) => user.id === currentUser)) setCurrentUser(usersQuery.data[0]?.id || "shella"); }, [usersQuery.data, currentUser]);
  useEffect(() => { if (tasksQuery.data) setTasksByUser((cache) => ({ ...cache, [activeUserId]: tasksQuery.data })); }, [tasksQuery.data, activeUserId]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => { setToast(""); setLastDeleted(null); }, lastDeleted ? 6500 : 3200); return () => clearTimeout(timer); }, [toast, lastDeleted]);
  const projects = useMemo(() => Array.from(new Set(tasks.map((t) => t.project))), [tasks]);
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
  const filtered = useMemo(() => tasks.filter((t) => (project === "all" || t.project === project) && (!search || `${t.title}${t.description}${t.project}${(t.logs || []).map((log) => log.content).join("")}`.toLowerCase().includes(search.toLowerCase()))), [tasks, project, search]);
  const done = tasks.filter((t) => t.status === "done").length;
  const doing = tasks.filter((t) => t.status === "doing").length;
  const overdue = tasks.filter((t) => t.status !== "done" && isBefore(new Date(`${t.dueDate}T23:59:59`), startOfDay(new Date()))).length;
  const saveTask = (data: Omit<Task, "id" | "createdAt">, id?: string) => {
    const original = id ? tasks.find((task) => task.id === id) : undefined;
    const task: Task = { ...data, id: id ?? uid(), createdAt: original?.createdAt ?? Date.now(), position: original?.position ?? 0, logs: original?.logs };
    if (isLocalMode) {
      applyTasks([task, ...tasks]);
      clearDraft(taskDraftKey(activeUserId, id ?? "new"), taskItemsDraftKey(activeUserId, id ?? "new"));
      setEditing(undefined); setToast(t(id ? "editSynced" : "createSynced"));
      return;
    }
    upsert.mutate({ userId: activeUserId, task }, { onSuccess: () => { clearDraft(taskDraftKey(activeUserId, id ?? "new"), taskItemsDraftKey(activeUserId, id ?? "new")); setEditing(undefined); setToast(t(id ? "editSynced" : "createSynced")); } });
  };
  const moveTaskDates = (task: Task, offset: number) => {
    const shift = (date: string) => format(addDays(new Date(`${date}T12:00:00`), offset), "yyyy-MM-dd");
    const moved = { ...task, startDate: shift(task.startDate), dueDate: shift(task.dueDate) };
    if (isLocalMode) { applyTasks(tasks.map((item) => item.id === task.id ? moved : item)); setToast(t("editSynced")); return; }
    setTasksByUser((cache) => ({ ...cache, [activeUserId]: (cache[activeUserId] ?? []).map((item) => item.id === task.id ? moved : item) }));
    upsert.mutate({ userId: activeUserId, task: moved }, { onSuccess: () => setToast(t("editSynced")), onError: () => { void tasksQuery.refetch(); } });
  };
  const openNew = (status: Status = "todo") => { setNewStatus(status); setEditing(null); };
  const saveWorkLog = (taskId: string, log: WorkLog) => {
    if (isLocalMode) {
      applyTasks(tasks.map((task) => task.id === taskId ? { ...task, status: log.status, progress: log.progress, logs: [log, ...(task.logs ?? [])], checklist: log.status === "done" ? task.checklist?.map((item) => ({ ...item, completed: true })) : task.checklist } : task));
      clearDraft(progressDraftKey(activeUserId, taskId)); setProgressTask(null); setToast(t("progressSynced"));
      return;
    }
    logMutation.mutate({ userId: activeUserId, taskId, log }, { onSuccess: () => { clearDraft(progressDraftKey(activeUserId, taskId)); setProgressTask(null); setToast(t("progressSynced")); } });
  };
  const updateStatus = (id: string, status: Status) => {
    if (!id) return;
    if (isLocalMode) {
      applyTasks(tasks.map((task) => task.id === id ? { ...task, status, position: 0, progress: status === "done" ? 100 : task.progress, checklist: status === "done" ? task.checklist?.map((item) => ({ ...item, completed: true })) : task.checklist } : task));
      setToast(t(status === "done" ? "doneSynced" : "statusSynced"));
      return;
    }
    statusMutation.mutate({ userId: activeUserId, id, status }, { onSuccess: () => setToast(t(status === "done" ? "doneSynced" : "statusSynced")) });
  };
  const reorderTasks = (orderedIds: string[]) => {
    const positions = new Map(orderedIds.map((id, index) => [id, (index + 1) * 100]));
    if (isLocalMode) { applyTasks(tasks.map((task) => positions.has(task.id) ? { ...task, position: positions.get(task.id) } : task).sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || b.createdAt - a.createdAt)); return; }
    setTasksByUser((cache) => ({ ...cache, [activeUserId]: (cache[activeUserId] ?? []).map((task) => positions.has(task.id) ? { ...task, position: positions.get(task.id) } : task).sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || b.createdAt - a.createdAt) }));
    reorderMutation.mutate({ userId: activeUserId, orderedIds }, { onError: () => { void tasksQuery.refetch(); } });
  };
  const deleteTask = (id: string) => {
    if (isLocalMode) {
      const deleted = tasks.find((task) => task.id === id);
      if (deleted) setLocalTrash((current) => [{ ...deleted, deletedAt: new Date() }, ...current]);
      applyTasks(tasks.filter((task) => task.id !== id && task.parentId !== id));
      setEditing(undefined); setLastDeleted(id); setToast(t("taskMovedTrash"));
      return;
    }
    remove.mutate({ userId: activeUserId, id }, { onSuccess: () => { setEditing(undefined); setLastDeleted(id); setToast(t("taskMovedTrash")); } });
  };
  const restoreTask = (id: string) => {
    if (isLocalMode) {
      const restored = localTrash.find((task) => task.id === id);
      if (restored) { applyTasks([{ ...restored, deletedAt: undefined }, ...tasks]); setLocalTrash((current) => current.filter((task) => task.id !== id)); }
      setLastDeleted(null); setToast(t("taskRestored"));
      return;
    }
    restoreMutation.mutate({ userId: activeUserId, id }, { onSuccess: () => { setLastDeleted(null); setToast(t("taskRestored")); void trashQuery.refetch(); } });
  };
  const purgeTask = (id: string) => {
    if (isLocalMode) { setLocalTrash((current) => current.filter((task) => task.id !== id)); setToast(t("taskPurged")); return; }
    purgeMutation.mutate({ userId: activeUserId, id }, { onSuccess: (remaining) => { utils.task.trash.setData({ userId: activeUserId }, remaining); setToast(t("taskPurged")); } });
  };
  const saveEditedLog = (log: WorkLog) => {
    if (isLocalMode) {
      applyTasks(tasks.map((task) => ({ ...task, logs: task.logs?.map((entry) => entry.id === log.id ? log : entry) })));
      clearDraft(logDraftKey(activeUserId, log.id)); setEditingLog(null); setToast(t("logUpdated"));
      return;
    }
    updateLogMutation.mutate({ userId: activeUserId, log }, { onSuccess: () => { clearDraft(logDraftKey(activeUserId, log.id)); setEditingLog(null); setToast(t("logUpdated")); } });
  };
  const deleteLog = (id: string) => {
    if (isLocalMode) { applyTasks(tasks.map((task) => ({ ...task, logs: task.logs?.filter((entry) => entry.id !== id) }))); setToast(t("logDeleted")); return; }
    deleteLogMutation.mutate({ userId: activeUserId, id }, { onSuccess: () => setToast(t("logDeleted")) });
  };
  const switchUser = (user: AppUser) => {
    setCurrentUser(user.id);
    setUserOpen(false);
    setProject("all");
    setSearch("");
    setToast(t("userSwitched", { name: user.name }));
  };
  const addUser = (name: string) => {
    createUserMutation.mutate({ name }, { onSuccess: ({ user, users: nextUsers }) => {
      utils.user.list.setData(undefined, nextUsers);
      setCurrentUser(user.id);
      setUserOpen(false);
      setToast(t("userCreated", { name: user.name }));
    } });
  };
  const deleteUser = (user: AppUser) => {
    deleteUserMutation.mutate({ id: user.id }, { onSuccess: (nextUsers) => {
      utils.user.list.setData(undefined, nextUsers);
      setTasksByUser((cache) => { const next = { ...cache }; delete next[user.id]; return next; });
      if (activeUserId === user.id) setCurrentUser(nextUsers[0]?.id || "shella");
      setToast(t("userDeleted", { name: user.name }));
    } });
  };

  if (authLoading) {
    return <div className="server-gate"><div className="server-state glass-panel"><Server size={30} /><h1>{t("loadingTitle")}</h1><p>{t("loadingDesc")}</p></div></div>;
  }
  if (!isAuthenticated && !isLocalMode) return <div className="auth-page"><Login onLocalMode={() => { localStorage.setItem("kempt.localMode", "1"); setLocalMode(true); }} /></div>;

  if (!isLocalMode && (usersQuery.isLoading || tasksQuery.isLoading)) {
    return <div className="server-gate"><div className="server-state glass-panel"><Server size={30} /><h1>{t("loadingTitle")}</h1><p>{t("loadingDesc")}</p></div></div>;
  }
  if (!isLocalMode && (usersQuery.error || tasksQuery.error)) {
    const error = usersQuery.error ?? tasksQuery.error;
    return <div className="server-gate"><div className="server-state glass-panel"><Server size={30} /><h1>{t("readError")}</h1><p>{error?.message}</p><button className="button primary" onClick={() => { void usersQuery.refetch(); void tasksQuery.refetch(); }}><RefreshCw size={16} />{t("retry")}</button></div></div>;
  }

  return <div className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" /><div className="noise" />
    <aside className="sidebar glass-panel">
      <button className="brand" onClick={() => setView("focus")} aria-label={t("backToday")}><span className="brand-mark"><i /><i /><i /></span><span className="brand-name">{language === "zh" ? "Kempt" : "Kempt"}</span></button>
      <nav className="main-nav" aria-label={t("mainNavigation")}>{navItems.map(({ id, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon size={20} /><span>{t(id === "focus" ? "today" : id)}</span></button>)}</nav>
      <div className="sidebar-foot">{isLocalMode ? <button className="local-mode-exit" onClick={() => { localStorage.removeItem("kempt.localMode"); setLocalMode(false); }}><Cloud size={16} /><span>{t("switchToAccount")}</span></button> : <><Cloud size={16} /><span>{t(syncing ? "syncingServer" : "syncedBackup")}</span></>}</div>
    </aside>
    <main className="workspace">
      <header className="topbar">
        <div className="greeting"><span>{format(new Date(), language === "zh" ? "M月d日 EEEE" : "EEE, MMM d", { locale: language === "zh" ? zhCN : enUS })}</span></div>
        <div className="top-actions">
          <button className={`reminder-button ${reminders.length ? "has-reminders" : ""}`} onClick={() => setReminderOpen(!reminderOpen)} aria-label={t("remindersAria", { count: reminders.length })}><Bell size={19} />{reminders.length > 0 && <span>{reminders.length}</span>}</button>
          <label className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchWork")} aria-label={t("searchWork")} />{search && <button onClick={() => setSearch("")} aria-label={t("clearSearch")}><X size={15} /></button>}</label>
          {!isLocalMode && <><button className="assistant-button" onClick={() => setAssistantOpen(true)} aria-label={t("assistant")} title={t("assistant")}><Bot size={19} /></button>
          <button className="user-button" onClick={() => setUserOpen(true)} aria-label={t("userManagement")}><UsersRound size={17} /><span>{activeUser?.name ?? "shella"}</span></button></>}
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
        <button onClick={() => setView("board")}><span className="stat-icon orange"><TimerReset size={18} /></span><span><b>{doing}</b><small>{t("inProgress")}</small></span></button>
        <button onClick={() => setView("board")}><span className="stat-icon green"><CheckCircle2 size={18} /></span><span><b>{done}</b><small>{t("completed")}</small></span></button>
        <div className="completion-stat"><div><span>{t("overallProgress")}</span><b>{overallProgress(tasks)}%</b></div><div className="overview-progress"><i style={{ width: `${overallProgress(tasks)}%` }} /></div></div>
        {overdue > 0 && <span className="overdue-note">{t("overdueCount", { count: overdue })}</span>}
      </section>
      <div className="content-toolbar"><div className="mobile-view-tabs">{navItems.map(({ id }) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{t(id === "focus" ? "today" : id)}</button>)}</div><div className="view-copy"><h2>{view === "focus" ? t("yourWorkspace") : view === "board" ? t("boardSubheading") : view === "logs" ? t("workJournal") : view === "projects" ? t("projectOverview") : t("projectTimeline")}</h2><span>{t("workItems", { count: filtered.length })}{search && ` · “${search}”`}</span></div><select value={project} onChange={(e) => setProject(e.target.value)} aria-label={t("projectFilter")}><option value="all">{t("allProjects")}</option>{projects.map((p) => <option value={p} key={p}>{p}</option>)}</select></div>
      <div className="view-container">
        {view === "focus" && <FocusView tasks={filtered} onEdit={setEditing} onUpdate={setProgressTask} onBoard={() => setView("board")} onReorder={reorderTasks} />}
        {view === "board" && <BoardView tasks={filtered} onEdit={setEditing} onUpdate={setProgressTask} onStatus={updateStatus} onNew={openNew} onReorder={reorderTasks} />}
        {view === "projects" && <ProjectsView tasks={filtered} onOpenProject={(name) => { setProject(name); setView("board"); }} />}
        {view === "gantt" && <GanttView tasks={filtered} onEdit={setEditing} onMove={moveTaskDates} />}
        {view === "logs" && <LogsView tasks={filtered} query={search} onEdit={setEditing} onBoard={() => setView("board")} onEditLog={(task, log) => setEditingLog({ task, log })} onDeleteLog={deleteLog} />}
      </div>
      <footer className="workspace-footer"><span>{t("footerSlogan")}</span><span>{t(isLocalMode ? "localOnlyFooter" : syncing ? "syncingChanges" : "syncedFooter")}</span></footer>
    </main>
    {reminderOpen && <ReminderCenter tasks={reminders} onClose={() => setReminderOpen(false)} onEdit={setEditing} onComplete={(id) => updateStatus(id, "done")} />}
    {editing !== undefined && <TaskDialog key={editing?.id ?? `new-${newStatus}`} userId={activeUserId} task={editing} defaultStatus={newStatus} onClose={() => setEditing(undefined)} onSave={saveTask} onDelete={editing ? deleteTask : undefined} onUpdate={(task) => { setEditing(undefined); setProgressTask(task); }} />}
    {dataOpen && <DataDialog userId={activeUserId} accountKey={accountKey || ""} localMode={isLocalMode} localTasks={localTasks} localTrash={localTrash} onLocalRestore={(restored, trash) => { setLocalTasks(restored); setLocalTrash(trash); }} onClose={() => setDataOpen(false)} onOpenTrash={() => { setDataOpen(false); setTrashOpen(true); }} />}
    {securityOpen && authUser && <SecurityDialog user={authUser} onClose={() => setSecurityOpen(false)} />}
    {trashOpen && <RecycleBinDialog tasks={isLocalMode ? localTrash : trashQuery.data ?? []} pending={restoreMutation.isPending || purgeMutation.isPending} onClose={() => setTrashOpen(false)} onRestore={restoreTask} onPurge={purgeTask} />}
    {editingLog && <LogEditDialog userId={activeUserId} task={editingLog.task} log={editingLog.log} onClose={() => setEditingLog(null)} onSave={saveEditedLog} />}
    {userOpen && <UserDialog users={users} currentUserId={activeUserId} authName={authUser?.name || authUser?.email || "Kimi"} onLogout={() => { setUserOpen(false); logout(); }} onOpenSecurity={() => { setUserOpen(false); setSecurityOpen(true); }} creating={createUserMutation.isPending} deleting={deleteUserMutation.isPending} onClose={() => setUserOpen(false)} onSwitch={switchUser} onCreate={addUser} onDelete={deleteUser} />}
    {progressTask && <ProgressDialog userId={activeUserId} task={progressTask} onClose={() => setProgressTask(null)} onSave={saveWorkLog} />}
    {assistantOpen && <AssistantPanel workspaceId={activeUserId} onClose={() => setAssistantOpen(false)} onTasks={applyTasks} />}
    {toast && <div className="toast" role="status"><CheckCircle2 size={18} /><span>{toast}</span>{lastDeleted && <button onClick={() => restoreTask(lastDeleted)}>{t("undo")}</button>}</div>}
  </div>;
}
