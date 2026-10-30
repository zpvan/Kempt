import { useState } from "react";
import { ArrowLeft, ArrowRight, Laptop, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/providers/preferences";
import { trpc } from "@/providers/trpc";

function getOAuthUrl() {
  const kimiAuthUrl = import.meta.env.VITE_KIMI_AUTH_URL;
  const appID = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${kimiAuthUrl}/api/oauth/authorize`);
  url.searchParams.set("client_id", appID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "profile");
  url.searchParams.set("state", state);

  return url.toString();
}

export default function Login({ onLocalMode }: { onLocalMode?: () => void }) {
  const { language, t } = usePreferences();
  const [method, setMethod] = useState<"kimi" | "local">("kimi");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const login = trpc.auth.loginLocal.useMutation({
    onSuccess: () => window.location.reload(),
    onError: () => setError(t("loginFailed")),
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    login.mutate({ identifier, password, ...(code ? { code } : {}) });
  };
  return <div className="login-card-wrap">
    <Card className="login-card glass-panel">
      <CardHeader className="login-intro">
        <div className="login-product"><div className="login-brand-mark"><i /><i /><i /></div><span>{language === "zh" ? "Kempt" : "Kempt"}</span></div>
        <div className="login-intro-copy"><CardTitle>{language === "zh" ? "工作，从容地继续。" : "Pick up where you left off."}</CardTitle><p>{language === "zh" ? "任务、项目与每一次进展，都在这里等你。" : "Your tasks, projects, and progress are ready when you are."}</p></div>
        <div className="login-privacy"><ShieldCheck size={16} /><span>{language === "zh" ? "私有工作区，登录后访问" : "Private workspace, sign in to continue"}</span></div>
      </CardHeader>
      <CardContent className="login-method-panel">
        {method === "kimi" ? <div className="login-method-content" key="kimi">
          <span className="overline">WELCOME BACK</span>
          <h2>{language === "zh" ? "欢迎回来" : "Welcome back"}</h2>
          <p className="login-method-description">{language === "zh" ? "使用你的 Kimi 账号安全登录。" : "Sign in securely with your Kimi account."}</p>
          <Button className="login-primary" size="lg" onClick={() => { window.location.href = getOAuthUrl(); }}>{t("signInKimi")}</Button>
          <button className="login-method-switch" onClick={() => setMethod("local")}>{language === "zh" ? "使用其他登录方式" : "Use another sign-in method"}<ArrowRight size={15} /></button>
          {onLocalMode && <button className="login-local-mode" onClick={onLocalMode}><Laptop size={17} /><span><b>{t("useLocalMode")}</b><small>{t("localModeDescription")}</small></span></button>}
        </div> : <div className="login-method-content" key="local">
          <button className="login-back" onClick={() => { setMethod("kimi"); setError(""); }}><ArrowLeft size={15} />{t("signInKimi")}</button>
          <div className="login-form-heading"><h2>{t("accountLogin")}</h2><p>{t("localLoginDescription")}</p></div>
          <form className="login-local-form" onSubmit={submit}>
            <label><span>{t("usernameOrEmail")}</span><input autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required /></label>
            <label><span>{t("password")}</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <label><span>{t("totpOptional")}</span><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <Button className="login-primary" size="lg" type="submit" disabled={login.isPending}>{t("signIn")}</Button>
          </form>
        </div>}
      </CardContent>
    </Card>
  </div>;
}
