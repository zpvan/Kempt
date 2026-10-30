import { useState } from "react";
import { Check, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePreferences } from "@/providers/preferences";
import { useRpcMutation } from "@/services/rpc";

export type AssistantModelConfig = { id: string; provider: "kimi" | "minimax"; name: string; baseUrl: string; model: string; isDefault: boolean; createdAt: string };
type FormState = { id?: string; provider: "kimi" | "minimax"; name: string; baseUrl: string; model: string; apiKey: string };
type SaveModelInput = Omit<FormState, "apiKey"> & { apiKey?: string };
type AvailableModel = { id: string; displayName?: string | null };
type AvailableResult = { models: AvailableModel[]; defaultModelId?: string | null };
type AvailableInput = { id?: string; provider: "kimi" | "minimax"; baseUrl: string; apiKey?: string };
const fresh = (): FormState => ({ provider: "kimi", name: "Kimi", baseUrl: "https://api.moonshot.ai/v1", model: "", apiKey: "" });
const modelsKey = ["rpc", "assistant.models.list", "{}"];

export default function AssistantSettings({ models, onDone }: { models: AssistantModelConfig[]; onDone: () => void }) {
  const { t } = usePreferences();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [available, setAvailable] = useState<AvailableModel[]>([]);
  const [loaded, setLoaded] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const onSuccess = (data: AssistantModelConfig[]) => { queryClient.setQueryData(modelsKey, data); setForm(null); setError(""); };
  const save = useRpcMutation<SaveModelInput, AssistantModelConfig[]>("assistant.models.save");
  const remove = useRpcMutation<{ id: string }, AssistantModelConfig[]>("assistant.models.delete");
  const setDefault = useRpcMutation<{ id: string }, AssistantModelConfig[]>("assistant.models.setDefault");
  const availableMutation = useRpcMutation<AvailableInput, AvailableResult>("assistant.models.available");
  const loadModels = async (current: FormState) => {
    setError(""); setLoaded(""); setAvailable([]);
    try {
      const result = await availableMutation.mutateAsync({ id: current.id, provider: current.provider, baseUrl: current.baseUrl, ...(current.apiKey ? { apiKey: current.apiKey } : {}) });
      setAvailable(result.models);
      setForm((latest) => latest ? { ...latest, model: result.models.some((model) => model.id === latest.model) ? latest.model : result.defaultModelId ?? "" } : latest);
      setLoaded(t("modelsLoaded", { count: result.models.length }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const edit = (model: AssistantModelConfig) => {
    const current = { id: model.id, provider: model.provider, name: model.name, baseUrl: model.baseUrl, model: model.model, apiKey: "" };
    setForm(current); setLoaded(""); void loadModels(current);
  };
  const changeProvider = (provider: "kimi" | "minimax") => {
    const current: FormState = { ...(form ?? fresh()), provider, name: provider === "kimi" ? "Kimi" : "MiniMax", baseUrl: provider === "kimi" ? "https://api.moonshot.ai/v1" : "https://api.minimax.cn/v1", model: "", apiKey: "" };
    setForm(current); setAvailable([]); setLoaded("");
    if (provider === "kimi") void loadModels(current);
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || !form.model) return;
    setError("");
    save.mutate({ id: form.id, provider: form.provider, name: form.name.trim() || `${form.provider === "kimi" ? "Kimi" : "MiniMax"} ${form.model}`, baseUrl: form.baseUrl, model: form.model, ...(form.apiKey ? { apiKey: form.apiKey } : {}) }, {
      onSuccess: (data) => { onSuccess(data); onDone(); },
      onError: (reason) => setError(reason.message),
    });
  };
  return <div className="assistant-settings">
    <div className="assistant-settings-list">{models.map((model) => <article className="model-row" key={model.id}>
      <div><span className={`model-provider ${model.provider}`}>{model.provider === "kimi" ? "Kimi" : "MiniMax"}</span><b>{model.name}</b><small>{model.model}</small></div>
      <div className="model-row-actions">{model.isDefault ? <span className="default-badge"><Check size={12} />{t("defaultModel")}</span> : <button className="icon-button small" onClick={() => setDefault.mutate({ id: model.id }, { onSuccess })} title={t("setDefault")}><Star size={14} /></button>}<button className="icon-button small" onClick={() => edit(model)} aria-label={t("editModel")}><Pencil size={14} /></button><button className="icon-button small user-delete" onClick={() => setConfirming(model.id)} aria-label={t("delete")}><Trash2 size={14} /></button></div>
      {confirming === model.id && <div className="model-delete-confirm"><span>{t("deleteConfirm")}</span><button className="text-danger" onClick={() => { remove.mutate({ id: model.id }, { onSuccess, onError: (reason) => setError(reason.message) }); setConfirming(null); }}>{t("confirm")}</button><button onClick={() => setConfirming(null)}>{t("cancel")}</button></div>}
    </article>)}</div>
    {!form && !models.length && <p className="assistant-no-models">{t("noModels")}</p>}
    {!form && <button className="button secondary add-model-button" onClick={() => { const current = fresh(); setForm(current); void loadModels(current); }}><Plus size={15} />{t("addModel")}</button>}
    {form && <form className="model-form" onSubmit={submit}>
      <div className="model-form-title"><b>{form.id ? t("editModel") : t("addModel")}</b>{models.length > 0 && <button type="button" className="icon-button small" onClick={() => setForm(null)} aria-label={t("close")}><X size={15} /></button>}</div>
      <label><span>{t("modelProvider")}</span><div className="segment-control two">{(["kimi", "minimax"] as const).map((provider) => <button type="button" key={provider} className={form.provider === provider ? "active" : ""} onClick={() => changeProvider(provider)}>{provider === "kimi" ? "Kimi" : "MiniMax"}</button>)}</div></label>
      <p className="model-provider-note">{t(form.provider === "kimi" ? "kimiNoKey" : "minimaxKeyRequired")}</p>
      <label><span>{t("modelName")}</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={`${form.provider === "kimi" ? "Kimi" : "MiniMax"} ${form.model}`} maxLength={100} /></label>
      {form.provider === "minimax" && <><label><span>{t("baseUrl")}</span><input required type="url" value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} /></label><label><span>{t("apiKey")}</span><input type="password" required={!form.id} value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder={form.id ? t("optionalApiKey") : t("apiKeyPlaceholder")} autoComplete="off" /></label></>}
      <button type="button" className="button secondary" disabled={availableMutation.isPending} onClick={() => void loadModels(form)}>{availableMutation.isPending ? t("thinking") : t("loadModels")}</button>
      {loaded && <p className="security-message" role="status">{loaded}</p>}
      {available.length > 0 && <label><span>{t("modelId")}</span><select required value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })}>{available.map((model) => <option value={model.id} key={model.id}>{model.displayName || model.id}</option>)}</select></label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary" disabled={save.isPending || !form.model} type="submit">{save.isPending ? t("thinking") : t("saveTestModel")}</button>
    </form>}
  </div>;
}
