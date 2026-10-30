import { useEffect, useRef, useState } from "react";
import { Bot, Check, Copy, Send, Settings, Sparkles, Trash2, UserRound, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Task } from "@/lib/tasks";
import { useRpcMutation, useRpcQuery } from "@/services/rpc";
import { usePreferences } from "@/providers/preferences";
import AssistantSettings, { type AssistantModelConfig } from "./AssistantSettings";

type AssistantAction = { id: string; messageId?: string | null; action: string; summary: string; status: string };
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; createdAt: number; actions?: AssistantAction[] };
type ChatResponse = { text: string; actions: AssistantAction[]; tasks: Task[] };
type ActionResult = { success: boolean; tasks: Task[] };
type ChatInput = { workspaceId: string; modelId?: string; message: string };

export default function AssistantPanel({ workspaceId, onClose, onTasks }: { workspaceId: string; onClose: () => void; onTasks: (tasks: Task[]) => void }) {
  const { t } = usePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [width, setWidth] = useState(() => Math.max(320, Math.min(760, Number(localStorage.getItem("kempt.assistant.width")) || 440)));
  const scrollRef = useRef<HTMLDivElement>(null);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelsQuery = useRpcQuery<AssistantModelConfig[]>("assistant.models.list");
  const historyQuery = useRpcQuery<ChatMessage[]>("assistant.chat.history", { workspaceId });
  const actionsQuery = useRpcQuery<AssistantAction[]>("assistant.chat.actions", { workspaceId });
  const models = (modelsQuery.data ?? []) as AssistantModelConfig[];
  const actionItems = (actionsQuery.data ?? []) as AssistantAction[];
  useEffect(() => { if (modelsQuery.data) { const preferred = models.find((model) => model.isDefault) ?? models[0]; if (preferred) setSelectedModel((current) => current || preferred.id); if (!models.length) setSettingsOpen(true); } }, [modelsQuery.data]);
  useEffect(() => {
    if (!historyQuery.data) return;
    setMessages(historyQuery.data.map((message) => ({ id: message.id, role: message.role, content: message.content, createdAt: message.createdAt, actions: actionItems.filter((action) => action.messageId === message.id) })));
  }, [historyQuery.data, actionItems]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);
  const chat = useRpcMutation<ChatInput, ChatResponse>("assistant.chat.chat");
  const clear = useRpcMutation<{ workspaceId: string }, { success: boolean }>("assistant.chat.clear");
  const execute = useRpcMutation<{ id: string }, ActionResult>("assistant.chat.executeAction");
  const reject = useRpcMutation<{ id: string }, { success: boolean }>("assistant.chat.rejectAction");
  const send = (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || chat.isPending || !models.length) return;
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: message, createdAt: Date.now() }]);
    setInput("");
    chat.mutate({ workspaceId, modelId: selectedModel || undefined, message }, {
      onSuccess: (result) => {
        const messageId = crypto.randomUUID();
        setMessages((current) => [...current, { id: messageId, role: "assistant", content: result.text, createdAt: Date.now(), actions: result.actions.map((action) => ({ ...action, messageId: action.messageId ?? messageId })) }]);
        onTasks(result.tasks);
        void actionsQuery.refetch();
      },
      onError: () => setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: t("modelSwitchFailed"), createdAt: Date.now() }]),
    });
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  const copyMessage = async (id: string, content: string) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(content);
      else {
        const textarea = document.createElement("textarea");
        textarea.value = content;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopyError(false); setCopiedId(id);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedId(null), 1600);
    } catch { setCopyError(true); }
  };
  const resize = (clientX: number) => {
    if (!resizeStart.current) return;
    const next = Math.max(320, Math.min(760, resizeStart.current.width + resizeStart.current.x - clientX));
    setWidth(next);
    localStorage.setItem("kempt.assistant.width", String(next));
  };
  const renderActions = (message: ChatMessage) => {
    const actions = message.actions?.length ? message.actions : actionItems.filter((action) => action.messageId === message.id);
    if (!actions.length) return null;
    return <div className="chat-actions"><small>{t("pendingConfirmation")}</small>{actions.map((action) => <div className={`chat-action ${action.status}`} key={action.id}><span>{action.summary}</span>{action.status === "pending" ? <div><button disabled={execute.isPending || reject.isPending} onClick={() => execute.mutate({ id: action.id }, { onSuccess: (result) => { onTasks(result.tasks); void actionsQuery.refetch(); } })}><Check size={12} />{t("confirmExecute")}</button><button disabled={execute.isPending || reject.isPending} onClick={() => reject.mutate({ id: action.id }, { onSuccess: () => { void actionsQuery.refetch(); } })}><X size={12} />{t("reject")}</button></div> : <small>{t(action.status === "executed" ? "executed" : "rejected")}</small>}</div>)}</div>;
  };
  return <div className="assistant-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="assistant-panel" style={{ width }} role="dialog" aria-modal="true" aria-label={t("assistant")}>
      <div className="assistant-resize-handle" role="separator" aria-orientation="vertical" aria-label={t("resizeAssistant")} title={t("resizeAssistant")} tabIndex={0} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); resizeStart.current = { x: event.clientX, width }; }} onPointerMove={(event) => { if (resizeStart.current) resize(event.clientX); }} onPointerUp={() => { resizeStart.current = null; }} onPointerCancel={() => { resizeStart.current = null; }} onDoubleClick={() => { setWidth(440); localStorage.setItem("kempt.assistant.width", "440"); }} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); const next = Math.max(320, Math.min(760, width + (event.key === "ArrowLeft" ? 20 : -20))); setWidth(next); localStorage.setItem("kempt.assistant.width", String(next)); } }}><i /></div>
      <header className="assistant-header"><div className="assistant-title"><Bot size={22} /><div><h2>{t("assistant")}</h2><p>{t("assistantSubtitle")}</p></div></div><button className="icon-button" onClick={onClose} aria-label={t("closeAssistant")}><X size={20} /></button></header>
      <div className="assistant-model-bar"><select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} aria-label={t("defaultModel")}>{models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.model}</option>)}</select><button className={`icon-button small ${settingsOpen ? "active" : ""}`} onClick={() => setSettingsOpen(!settingsOpen)} aria-label={t("modelSettings")}><Settings size={17} /></button><button className="icon-button small" disabled={!messages.length} onClick={() => clear.mutate({ workspaceId }, { onSuccess: () => setMessages([]) })} aria-label={t("clearChat")}><Trash2 size={16} /></button></div>
      {copyError && <span className="copy-error">{t("copyFailed")}</span>}
      {settingsOpen ? <AssistantSettings models={models} onDone={() => setSettingsOpen(false)} /> : <>
        <div className="assistant-messages" ref={scrollRef}>{messages.length ? messages.map((message) => <article className={`chat-message ${message.role}`} key={message.id}><span className="chat-avatar">{message.role === "user" ? <UserRound size={14} /> : <Bot size={14} />}</span><div className="chat-bubble">{message.role === "assistant" && <button className="chat-copy" onClick={() => void copyMessage(message.id, message.content)} aria-label={copiedId === message.id ? t("copied") : t("copy")} title={copiedId === message.id ? t("copied") : t("copy")}>{copiedId === message.id ? <Check size={13} /> : <Copy size={13} />}</button>}{message.role === "assistant" ? <div className="chat-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer" /> }}>{message.content}</ReactMarkdown></div> : <p>{message.content}</p>}{renderActions(message)}</div></article>) : <div className="assistant-empty"><Sparkles size={26} /><h3>{t("assistantEmpty")}</h3><p>{t("assistantEmptyHint")}</p><div className="assistant-suggestions"><button onClick={() => send(t("summarizeWork"))}>{t("summarizeWork")}</button><button onClick={() => send(t("todayFocus"))}>{t("todayFocus")}</button><button onClick={() => send(t("createTaskExample"))}>{t("createTaskExample")}</button></div></div>}
          {chat.isPending && <div className="chat-thinking"><i /><i /><i /><span>{t("thinking")}</span></div>}
        </div>
        <form className="assistant-composer" onSubmit={(event) => { event.preventDefault(); send(); }}><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder={t("chatPlaceholder")} rows={2} maxLength={4000} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} /><button className="button primary" disabled={!input.trim() || chat.isPending || !models.length} type="submit" aria-label={t("send")}><Send size={17} /></button></form>
      </>}
    </aside>
  </div>;
}
