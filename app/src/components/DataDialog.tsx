import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Database, FileJson, Trash2, X } from "lucide-react";
import { format } from "date-fns";
import type { FullBackup } from "@contracts/types";
import type { Task } from "@/lib/tasks";
import { trpc } from "@/providers/trpc";
import { usePreferences } from "@/providers/preferences";

interface Props {
  userId: string;
  accountKey: string;
  localMode: boolean;
  localTasks: Task[];
  localTrash: Task[];
  onLocalRestore: (tasks: Task[], trash: Task[]) => void;
  onClose: () => void;
  onOpenTrash: () => void;
}

function isFullBackup(value: unknown): value is FullBackup {
  if (!value || typeof value !== "object") return false;
  const backup = value as Partial<FullBackup>;
  return backup.format === "kempt-full-backup" && backup.version === 2 && Array.isArray(backup.users) && backup.users.length > 0 && Array.isArray(backup.tasks);
}

export default function DataDialog({ userId, accountKey, localMode, localTasks, localTrash, onLocalRestore, onClose, onOpenTrash }: Props) {
  const { theme, language, t } = usePreferences();
  const fileInput = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<FullBackup | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const backupQuery = trpc.backup.export.useQuery(undefined, { enabled: !localMode });
  const localBackup: FullBackup = {
    app: "Kempt", format: "kempt-full-backup", version: 2, exportedAt: new Date().toISOString(),
    users: [{ id: "local", ownerUnionId: "local", name: "本地工作区", isDefault: true }],
    tasks: [...localTasks, ...localTrash].map((task) => ({ ...task, userId: "local", deletedAt: task.deletedAt?.toISOString() ?? null })),
  };
  const exportData = localMode ? localBackup : backupQuery.data;
  const restoreMutation = trpc.backup.restore.useMutation({
    onSuccess: () => {
      const preferences = backup?.preferences;
      if (preferences?.theme) localStorage.setItem("kempt.theme", preferences.theme);
      if (preferences?.language) localStorage.setItem("kempt.language", preferences.language);
      localStorage.removeItem(`kempt.tasks.users.v1.${accountKey}`);
      localStorage.setItem(`kempt.currentUser.${accountKey}`, preferences?.currentUser || "shella");
      window.location.reload();
    },
    onError: (reason) => setError(reason.message),
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  const exportJson = () => {
    if (!exportData) return;
    const payload: FullBackup = { ...exportData, preferences: { theme, language, currentUser: userId } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `Kempt-${format(new Date(), "yyyy-MM-dd")}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const readFile = async (file?: File) => {
    setError(""); setBackup(null); setFileName("");
    if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error(t("fileTooLarge"));
      const parsed: unknown = JSON.parse(await file.text());
      if (!isFullBackup(parsed)) throw new Error(t("invalidBackup"));
      setBackup(parsed); setFileName(file.name);
    } catch (reason) {
      setError(reason instanceof SyntaxError ? t("invalidJson") : reason instanceof Error ? reason.message : t("readFileFailed"));
    }
  };
  const serverTasks = exportData?.tasks ?? [];
  const serverLogs = serverTasks.reduce((sum, task) => sum + (task.logs?.length || 0), 0);
  const importedLogs = backup?.tasks.reduce((sum, task) => sum + (task.logs?.length || 0), 0) ?? 0;
  const toLocalTask = (task: FullBackup["tasks"][number]): Task => ({ ...task, parentId: task.parentId ?? undefined, sourceUrl: task.sourceUrl ?? undefined, deletedAt: task.deletedAt ? new Date(task.deletedAt) : undefined });
  const restore = () => {
    if (!backup) return;
    if (localMode) {
      onLocalRestore(backup.tasks.filter((task) => !task.deletedAt).map(toLocalTask), backup.tasks.filter((task) => task.deletedAt).map(toLocalTask));
      const preferences = backup.preferences;
      if (preferences?.theme) localStorage.setItem("kempt.theme", preferences.theme);
      if (preferences?.language) localStorage.setItem("kempt.language", preferences.language);
      localStorage.setItem("kempt.localMode", "1");
      window.location.reload();
      return;
    }
    restoreMutation.mutate({ backup });
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="dialog data-dialog" role="dialog" aria-modal="true" aria-labelledby="data-title">
      <header className="dialog-head"><div className="ai-heading"><Database size={22} /><div><span className="overline">FULL BACKUP</span><h2 id="data-title">{t("dataTitle")}</h2></div></div><div className="dialog-head-actions"><button className="button secondary compact" onClick={onOpenTrash}><Trash2 size={15} />{t("recycleBin")}</button><button className="icon-button" onClick={onClose} aria-label={t("close")}><X size={20} /></button></div></header>
      <div className="data-section"><div className="data-section-title"><span className="data-icon"><ArrowDownToLine size={19} /></span><div><h3>{t("exportAll")}</h3><p>{t("exportDesc")}</p></div></div><div className="export-summary"><span><b>{exportData?.users.length ?? "…"}</b> {t("users")}</span><span><b>{exportData ? serverTasks.length : "…"}</b> {t("tasksCount")}</span><span><b>{exportData ? serverLogs : "…"}</b> {t("logsCount")}</span><span><b>{exportData ? serverTasks.filter((task) => task.deletedAt).length : "…"}</b> {t("recycleBin")}</span><button className="button secondary" onClick={exportJson} disabled={!exportData}><ArrowDownToLine size={16} />{t("exportJson")}</button></div>{!localMode && backupQuery.error && <div className="ai-error data-error" role="alert"><span>{backupQuery.error.message}</span></div>}</div>
      <div className="data-divider" />
      <div className="data-section"><div className="data-section-title"><span className="data-icon"><ArrowUpFromLine size={19} /></span><div><h3>{t("importJson")}</h3><p>{t("importDesc")}</p></div></div>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(event) => { void readFile(event.target.files?.[0]); event.target.value = ""; }} />
        <button className="json-dropzone" onClick={() => fileInput.current?.click()}><FileJson size={25} /><b>{fileName || t("chooseJson")}</b><span>{t("jsonFileHint")}</span></button>
        {error && <div className="ai-error data-error" role="alert"><b>{t("importFailed")}</b><span>{error}</span></div>}
        {backup && <div className="import-preview restore-preview"><CheckCircle2 size={18} /><div><b>{t("backupRecognized", { users: backup.users.length, tasks: backup.tasks.length, logs: importedLogs })}</b><span>{t(localMode ? "localRestoreWarning" : "restoreWarning")}</span></div><button className="button danger" disabled={restoreMutation.isPending} onClick={restore}>{t("confirmImport")}</button></div>}
      </div>
      <footer className="data-footer">{t(localMode ? "localBackupFooter" : "dataFooter")}</footer>
    </section>
  </div>;
}
