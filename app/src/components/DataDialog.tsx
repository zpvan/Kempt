import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Database, FileJson, Trash2, X } from "lucide-react";
import { format } from "date-fns";
import type { FullBackup } from "@contracts/types";
import { usePreferences } from "@/providers/preferences";
import { useRpcMutation, useRpcQuery } from "@/services/rpc";
import { useFiles } from "@/services/fileProvider";
import { BRAND } from "@/branding";
import { isKemptBackup } from "@/services/backups";

interface Props {
  userId: string;
  onClose: () => void;
  onOpenTrash: () => void;
}

export default function DataDialog({ userId, onClose, onOpenTrash }: Props) {
  const { theme, language, t } = usePreferences();
  const files = useFiles();
  const [backup, setBackup] = useState<FullBackup | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const backupQuery = useRpcQuery<FullBackup>("backup.export");
  const exportData = backupQuery.data;
  const restoreMutation = useRpcMutation<{ backup: FullBackup }, unknown>("backup.restore");
  useEffect(() => {
    const handler = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  const exportJson = async () => {
    if (!exportData) return;
    setError("");
    try {
      const payload: FullBackup = { ...exportData, preferences: { theme, language, currentUser: userId } };
      await files.saveJson(BRAND.backupFile(format(new Date(), "yyyy-MM-dd")), JSON.stringify(payload, null, 2));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("readFileFailed"));
    }
  };
  const readFile = async () => {
    setError(""); setBackup(null); setFileName("");
    try {
      const file = await files.readJson();
      if (!file) return;
      const parsed: unknown = JSON.parse(file.contents);
      if (!isKemptBackup(parsed)) throw new Error(t("invalidBackup"));
      setBackup(parsed); setFileName(file.fileName);
    } catch (reason) {
      setError(reason instanceof SyntaxError ? t("invalidJson") : reason instanceof Error ? reason.message : t("readFileFailed"));
    }
  };
  const serverTasks = exportData?.tasks ?? [];
  const serverLogs = serverTasks.reduce((sum, task) => sum + (task.logs?.length || 0), 0);
  const importedLogs = backup?.tasks.reduce((sum, task) => sum + (task.logs?.length || 0), 0) ?? 0;
  const restore = () => {
    if (!backup) return;
    restoreMutation.mutate({ backup }, {
      onSuccess: () => {
        const preferences = backup.preferences;
        if (preferences?.theme) localStorage.setItem("kempt.theme", preferences.theme);
        if (preferences?.language) localStorage.setItem("kempt.language", preferences.language);
        localStorage.setItem("kempt.currentUser", preferences?.currentUser || "admin");
        onClose();
      },
      onError: (reason) => setError(reason.message),
    });
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="dialog data-dialog" role="dialog" aria-modal="true" aria-labelledby="data-title">
      <header className="dialog-head"><div className="ai-heading"><Database size={22} /><div><span className="overline">FULL BACKUP</span><h2 id="data-title">{t("dataTitle")}</h2></div></div><div className="dialog-head-actions"><button className="button secondary compact" onClick={onOpenTrash}><Trash2 size={15} />{t("recycleBin")}</button><button className="icon-button" onClick={onClose} aria-label={t("close")}><X size={20} /></button></div></header>
      <div className="data-section"><div className="data-section-title"><span className="data-icon"><ArrowDownToLine size={19} /></span><div><h3>{t("exportAll")}</h3><p>{t("exportDesc")}</p></div></div><div className="export-summary"><span><b>{exportData?.users.length ?? "…"}</b> {t("users")}</span><span><b>{exportData ? serverTasks.length : "…"}</b> {t("tasksCount")}</span><span><b>{exportData ? serverLogs : "…"}</b> {t("logsCount")}</span><span><b>{exportData ? serverTasks.filter((task) => task.deletedAt).length : "…"}</b> {t("recycleBin")}</span><button className="button secondary" onClick={() => void exportJson()} disabled={!exportData}><ArrowDownToLine size={16} />{t("exportJson")}</button></div>{backupQuery.error && <div className="ai-error data-error" role="alert"><span>{backupQuery.error.message}</span></div>}</div>
      <div className="data-divider" />
      <div className="data-section"><div className="data-section-title"><span className="data-icon"><ArrowUpFromLine size={19} /></span><div><h3>{t("importJson")}</h3><p>{t("importDesc")}</p></div></div>
        <button className="json-dropzone" onClick={() => void readFile()}><FileJson size={25} /><b>{fileName || t("chooseJson")}</b><span>{t("jsonFileHint")}</span></button>
        {error && <div className="ai-error data-error" role="alert"><b>{t("importFailed")}</b><span>{error}</span></div>}
        {backup && <div className="import-preview restore-preview"><CheckCircle2 size={18} /><div><b>{t("backupRecognized", { users: backup.users.length, tasks: backup.tasks.length, logs: importedLogs })}</b><span>{t("restoreWarning")}</span></div><button className="button danger" disabled={restoreMutation.isPending} onClick={restore}>{t("confirmImport")}</button></div>}
      </div>
      <footer className="data-footer">{t("dataFooter")}</footer>
    </section>
  </div>;
}
