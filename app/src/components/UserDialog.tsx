import { useEffect, useState } from "react";
import { Check, Plus, Trash2, UserRound, UsersRound, X } from "lucide-react";
import type { AppUser } from "@contracts/types";
import { usePreferences } from "@/providers/preferences";

interface Props {
  users: AppUser[];
  currentUserId: string;
  creating: boolean;
  deleting: boolean;
  onClose: () => void;
  onSwitch: (user: AppUser) => void;
  onCreate: (name: string) => void;
  onDelete: (user: AppUser) => void;
}

export default function UserDialog({ users, currentUserId, creating, deleting, onClose, onSwitch, onCreate, onDelete }: Props) {
  const { t } = usePreferences();
  const [name, setName] = useState("");
  const [confirming, setConfirming] = useState<AppUser | null>(null);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim()) onCreate(name.trim());
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="dialog user-dialog" role="dialog" aria-modal="true" aria-labelledby="user-dialog-title">
      <header className="dialog-head"><div className="ai-heading"><UsersRound size={22} /><div><span className="overline">WORKSPACES</span><h2 id="user-dialog-title">{t("userManagement")}</h2></div></div><button className="icon-button" onClick={onClose} aria-label={t("close")}><X size={20} /></button></header>
      <div className="user-dialog-body">
        <p className="user-intro">{t("userList")}</p>
        <div className="user-list">{users.map((user) => <div className={`user-row ${user.id === currentUserId ? "active" : ""}`} key={user.id}>
          <button className="user-switch" onClick={() => onSwitch(user)} disabled={user.id === currentUserId}>
            <span className="user-avatar"><UserRound size={17} /></span>
            <span className="user-row-name"><b>{user.name}</b><small>{user.id === currentUserId ? t("currentUser") : user.isDefault ? t("defaultUser") : ""}</small></span>
            {user.id === currentUserId ? <Check size={17} /> : <span className="user-switch-label">{t("switchUser")}</span>}
          </button>
          {!user.isDefault && <button className="icon-button small user-delete" onClick={() => setConfirming(user)} aria-label={`${t("deleteUser")} ${user.name}`}><Trash2 size={15} /></button>}
        </div>)}</div>
        <form className="user-create" onSubmit={submit}>
          <label><span>{t("userName")}</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("userNamePlaceholder")} maxLength={40} /></label>
          <button className="button primary" type="submit" disabled={!name.trim() || creating}><Plus size={16} />{t("createUser")}</button>
        </form>
        {confirming && <div className="user-delete-confirm" role="alert"><p>{t("deleteUserConfirm", { name: confirming.name })}</p><div><button className="button secondary compact" onClick={() => setConfirming(null)}>{t("cancel")}</button><button className="button danger compact" disabled={deleting} onClick={() => { onDelete(confirming); setConfirming(null); }}><Trash2 size={14} />{t("confirm")}</button></div></div>}
      </div>
    </section>
  </div>;
}
