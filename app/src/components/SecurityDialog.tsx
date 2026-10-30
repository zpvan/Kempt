import { useEffect, useState } from "react";
import { Copy, KeyRound, Plus, ShieldCheck, X } from "lucide-react";
import type { User } from "@db/schema";
import { trpc } from "@/providers/trpc";
import { usePreferences } from "@/providers/preferences";

type AuthUser = Omit<User, "passwordHash" | "totpSecret">;

export default function SecurityDialog({ user, onClose }: { user: AuthUser; onClose: () => void }) {
  const { t } = usePreferences();
  const utils = trpc.useUtils();
  const [setup, setSetup] = useState<{ secret: string; url: string } | null>(null);
  const [enabled, setEnabled] = useState(user.totpEnabled);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [account, setAccount] = useState({ username: "", email: "", password: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const handler = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  const enable = trpc.auth.enableTotp.useMutation({
    onSuccess: () => { setEnabled(true); setSetup(null); setCode(""); setMessage(t("totpEnabledStatus")); void utils.auth.me.invalidate(); },
    onError: (reason) => setError(reason.message),
  });
  const disable = trpc.auth.disableTotp.useMutation({
    onSuccess: () => { setEnabled(false); setCode(""); setMessage(t("totpDisabledStatus")); void utils.auth.me.invalidate(); },
    onError: (reason) => setError(reason.message),
  });
  const create = trpc.auth.createLocalAccount.useMutation({
    onSuccess: ({ username }) => { setAccount({ username: "", email: "", password: "" }); setMessage(t("accountCreated", { name: username })); setError(""); },
    onError: (reason) => setError(reason.message),
  });
  const generate = async () => {
    setError(""); setMessage("");
    const data = await utils.auth.setupTotp.fetch();
    setSetup(data);
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="dialog security-dialog" role="dialog" aria-modal="true" aria-labelledby="security-title">
      <header className="dialog-head"><div className="ai-heading"><ShieldCheck size={22} /><div><span className="overline">SECURITY</span><h2 id="security-title">{t("securitySettings")}</h2></div></div><button className="icon-button" onClick={onClose} aria-label={t("close")}><X size={20} /></button></header>
      <div className="security-body">
        <section className="security-section"><div className="security-heading"><KeyRound size={18} /><div><h3>{t("authenticator")}</h3><p>{t("authenticatorDesc")}</p></div></div>
          <p className={`security-status ${enabled ? "enabled" : ""}`}>{t(enabled ? "totpEnabledStatus" : "totpDisabledStatus")}</p>
          {!enabled && !setup && <button className="button secondary" onClick={() => void generate()}>{t("enableAuthenticator")}</button>}
          {setup && <div className="totp-setup"><label><span>{t("secretKey")}</span><div className="secret-row"><code>{setup.secret}</code><button className="icon-button small" onClick={() => { void navigator.clipboard.writeText(setup.secret); setCopied(true); }} aria-label={t("copy")}><Copy size={14} /></button></div></label><a href={setup.url}>{t("authenticatorDesc")}</a><small>{copied ? t("copied") : setup.url}</small><label><span>{t("verificationCode")}</span><input inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" /></label><button className="button primary" disabled={code.length !== 6 || enable.isPending} onClick={() => { setError(""); enable.mutate({ secret: setup.secret, code }); }}>{t("verifyAndEnable")}</button></div>}
          {enabled && <div className="totp-disable"><label><span>{t("verificationCode")}</span><input inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" /></label><button className="button secondary" disabled={code.length !== 6 || disable.isPending} onClick={() => { setError(""); disable.mutate({ code }); }}>{t("disableAuthenticator")}</button></div>}
        </section>
        {user.role === "admin" && <section className="security-section"><div className="security-heading"><Plus size={18} /><div><h3>{t("createAccount")}</h3><p>{t("localLoginDescription")}</p></div></div><form className="local-account-form" onSubmit={(event) => { event.preventDefault(); setError(""); setMessage(""); create.mutate({ username: account.username, email: account.email, password: account.password }); }}>
          <label><span>{t("newUsername")}</span><input required minLength={3} value={account.username} onChange={(event) => setAccount({ ...account, username: event.target.value })} /></label>
          <label><span>{t("newEmailOptional")}</span><input type="email" value={account.email} onChange={(event) => setAccount({ ...account, email: event.target.value })} /></label>
          <label><span>{t("initialPassword")}</span><input required minLength={10} type="password" autoComplete="new-password" value={account.password} onChange={(event) => setAccount({ ...account, password: event.target.value })} /><small>{t("passwordRule")}</small></label>
          <button className="button primary" disabled={create.isPending} type="submit"><Plus size={15} />{t("createAccount")}</button>
        </form></section>}
        {message && <p className="security-message" role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </section>
  </div>;
}
