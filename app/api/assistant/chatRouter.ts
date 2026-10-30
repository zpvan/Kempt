import { and, desc, eq, inArray } from "drizzle-orm";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { assertWorkspaceAccess } from "../queries/workspaces";
import { listTasks, logValues, taskValues } from "../queries/tasks";
import { resolveAssistantModel } from "./modelRouter";
import { assistantProvider } from "./provider";
import { classifyAiError } from "./ai-client";
import { assistantActions, assistantMessages, checklistItems, tasks, workLogs } from "@db/schema";
import type { Task } from "@contracts/types";

const workspaceInput = z.object({ workspaceId: z.string().min(1).max(64) });
const taskIdInput = z.object({ taskId: z.string().min(1).max(191) });
const statusInput = z.enum(["todo", "doing", "done"]);

async function ownedTask(taskId: string, workspaceId: string) {
  const [task] = await getDb().select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, workspaceId))).limit(1);
  if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found in this workspace" });
  return task;
}

async function ownedAction(id: string, ownerUnionId: string) {
  const [action] = await getDb().select().from(assistantActions).where(and(eq(assistantActions.id, id), eq(assistantActions.ownerUnionId, ownerUnionId))).limit(1);
  if (!action || action.status !== "pending") throw new TRPCError({ code: "NOT_FOUND", message: "Pending action not found" });
  return action;
}

export const assistantChatRouter = createRouter({
  history: authedQuery.input(workspaceInput).query(async ({ ctx, input }) => {
    await assertWorkspaceAccess(input.workspaceId, ctx.user.unionId);
    const rows = await getDb().select().from(assistantMessages).where(and(eq(assistantMessages.ownerUnionId, ctx.user.unionId), eq(assistantMessages.workspaceId, input.workspaceId))).orderBy(desc(assistantMessages.createdAt)).limit(50);
    return rows.reverse();
  }),
  actions: authedQuery.input(workspaceInput).query(async ({ ctx, input }) => {
    await assertWorkspaceAccess(input.workspaceId, ctx.user.unionId);
    return getDb().select().from(assistantActions).where(eq(assistantActions.ownerUnionId, ctx.user.unionId)).orderBy(desc(assistantActions.createdAt)).limit(50);
  }),
  clear: authedQuery.input(workspaceInput).mutation(async ({ ctx, input }) => {
    await assertWorkspaceAccess(input.workspaceId, ctx.user.unionId);
    await getDb().delete(assistantMessages).where(and(eq(assistantMessages.ownerUnionId, ctx.user.unionId), eq(assistantMessages.workspaceId, input.workspaceId)));
    return { success: true };
  }),
  rejectAction: authedQuery.input(z.object({ id: z.string().min(1).max(191) })).mutation(async ({ ctx, input }) => {
    const action = await ownedAction(input.id, ctx.user.unionId);
    await getDb().update(assistantActions).set({ status: "rejected", decidedAt: Date.now() }).where(eq(assistantActions.id, action.id));
    return { success: true };
  }),
  executeAction: authedQuery.input(z.object({ id: z.string().min(1).max(191) })).mutation(async ({ ctx, input }) => {
    const action = await ownedAction(input.id, ctx.user.unionId);
    const payload = JSON.parse(action.payload) as Record<string, unknown>;
    const workspaceId = String(payload.workspaceId);
    await assertWorkspaceAccess(workspaceId, ctx.user.unionId);
    if (action.action === "create_task") {
      const task: Task = { id: crypto.randomUUID(), title: String(payload.title), description: String(payload.description || ""), project: String(payload.project || "个人工作"), status: "todo", priority: payload.priority === "high" || payload.priority === "low" ? payload.priority : "medium", startDate: String(payload.startDate), dueDate: String(payload.dueDate), progress: 0, position: 0, logs: [], checklist: [], createdAt: Date.now() };
      await getDb().insert(tasks).values(taskValues(task, workspaceId));
    } else if (action.action === "update_task_status") {
      await ownedTask(String(payload.taskId), workspaceId);
      const status = payload.status === "done" ? "done" : payload.status === "doing" ? "doing" : "todo";
      await getDb().transaction(async (tx) => {
        if (status === "done") await tx.update(checklistItems).set({ completed: true }).where(eq(checklistItems.taskId, String(payload.taskId)));
        await tx.update(tasks).set({ status, position: 0, progress: status === "done" ? 100 : 0, updatedAt: new Date() }).where(and(eq(tasks.id, String(payload.taskId)), eq(tasks.userId, workspaceId)));
      });
    } else if (action.action === "add_progress_log") {
      await ownedTask(String(payload.taskId), workspaceId);
      const status: "todo" | "doing" | "done" = payload.status === "done" ? "done" : payload.status === "doing" ? "doing" : "todo";
      const log = { id: crypto.randomUUID(), date: String(payload.date), content: String(payload.content), progress: status === "done" ? 100 : Math.max(0, Math.min(100, Number(payload.progress) || 0)), status, createdAt: Date.now() };
      await getDb().transaction(async (tx) => {
        if (status === "done") await tx.update(checklistItems).set({ completed: true }).where(eq(checklistItems.taskId, String(payload.taskId)));
        await tx.insert(workLogs).values(logValues(String(payload.taskId), log));
        await tx.update(tasks).set({ status, progress: log.progress, updatedAt: new Date() }).where(and(eq(tasks.id, String(payload.taskId)), eq(tasks.userId, workspaceId)));
      });
    } else if (action.action === "move_task_to_recycle_bin") {
      await ownedTask(String(payload.taskId), workspaceId);
      await getDb().update(tasks).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(tasks.id, String(payload.taskId)), eq(tasks.userId, workspaceId)));
    } else if (action.action === "reorder_tasks") {
      const orderedIds = Array.isArray(payload.orderedIds) ? payload.orderedIds.map(String) : [];
      const owned = await getDb().select({ id: tasks.id }).from(tasks).where(eq(tasks.userId, workspaceId));
      const allowed = new Set(owned.map((task) => task.id));
      if (!orderedIds.length || orderedIds.some((id) => !allowed.has(id))) throw new TRPCError({ code: "BAD_REQUEST", message: "Task order contains an unknown task" });
      await getDb().transaction(async (tx) => {
        for (const [index, id] of orderedIds.entries()) await tx.update(tasks).set({ position: (index + 1) * 100, updatedAt: new Date() }).where(and(eq(tasks.id, id), eq(tasks.userId, workspaceId)));
      });
    } else {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported assistant action" });
    }
    await getDb().update(assistantActions).set({ status: "executed", decidedAt: Date.now() }).where(eq(assistantActions.id, action.id));
    return { tasks: await listTasks(workspaceId), success: true };
  }),
  chat: authedQuery.input(workspaceInput.extend({ modelId: z.string().max(64).optional(), message: z.string().trim().min(1).max(4000) })).mutation(async ({ ctx, input }) => {
    await assertWorkspaceAccess(input.workspaceId, ctx.user.unionId);
    const model = await resolveAssistantModel(input.modelId, ctx.user.unionId);
    const db = getDb();
    const taskData = await listTasks(input.workspaceId);
    const historyRows = await db.select().from(assistantMessages).where(and(eq(assistantMessages.ownerUnionId, ctx.user.unionId), eq(assistantMessages.workspaceId, input.workspaceId))).orderBy(desc(assistantMessages.createdAt)).limit(12);
    const history = historyRows.reverse().map((row) => ({ role: row.role, content: row.content }));
    await db.insert(assistantMessages).values({ id: crypto.randomUUID(), ownerUnionId: ctx.user.unionId, workspaceId: input.workspaceId, modelId: model.id, role: "user", content: input.message, createdAt: Date.now() });
    const proposalIds: string[] = [];
    const propose = async (action: string, payload: Record<string, unknown>, summary: string) => {
      const id = crypto.randomUUID();
      await db.insert(assistantActions).values({ id, ownerUnionId: ctx.user.unionId, action, payload: JSON.stringify(payload), summary, status: "pending", createdAt: Date.now() });
      proposalIds.push(id);
      return { id, status: "pending", summary };
    };
    const system = `You are Kempt's private assistant. Help the user discuss, summarize, and manage only the current workspace's tasks. Current date: ${new Date().toISOString().slice(0, 10)}. Use the user's language. Read tools can run directly. Mutation tools only create pending proposals: never claim a task was changed, created, deleted, or reordered until the user confirms in the app. Ask for confirmation in your reply. Do not permanently delete anything. When creating work, require a title and due date. Keep summaries practical and concise. Current tasks: ${JSON.stringify(taskData.slice(0, 100).map((task) => ({ id: task.id, title: task.title, project: task.project, status: task.status, priority: task.priority, startDate: task.startDate, dueDate: task.dueDate, progress: task.progress, position: task.position, logs: task.logs?.slice(0, 8), checklist: task.checklist })))}`;
    const tools = {
      list_tasks: tool({ description: "List current tasks, progress, deadlines, logs, and checklists in this workspace.", inputSchema: z.object({}), execute: async () => listTasks(input.workspaceId) }),
      create_task: tool({ description: "Propose creating a task with a title and due date. This only creates a pending proposal.", inputSchema: z.object({ title: z.string().min(1).max(500), description: z.string().default(""), project: z.string().default("个人工作"), priority: z.enum(["low", "medium", "high"]).default("medium"), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), execute: async (args) => propose("create_task", { ...args, workspaceId: input.workspaceId }, `新建任务“${args.title}”，截止 ${args.dueDate}`) }),
      update_task_status: tool({ description: "Propose changing a task's status. This only creates a pending proposal.", inputSchema: taskIdInput.extend({ status: statusInput }), execute: async (args) => {
        const task = await ownedTask(args.taskId, input.workspaceId);
        return propose("update_task_status", { ...args, workspaceId: input.workspaceId }, `将“${task.title}”状态改为 ${args.status}`);
      } }),
      add_progress_log: tool({ description: "Propose adding a work progress log. This only creates a pending proposal.", inputSchema: taskIdInput.extend({ content: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), progress: z.number().int().min(0).max(100), status: statusInput }), execute: async (args) => {
        const task = await ownedTask(args.taskId, input.workspaceId);
        return propose("add_progress_log", { ...args, workspaceId: input.workspaceId }, `为“${task.title}”添加进展：${args.content}`);
      } }),
      move_task_to_recycle_bin: tool({ description: "Propose moving a task to the recycle bin without permanently deleting it.", inputSchema: taskIdInput, execute: async (args) => {
        const task = await ownedTask(args.taskId, input.workspaceId);
        return propose("move_task_to_recycle_bin", { ...args, workspaceId: input.workspaceId }, `将“${task.title}”移入回收站`);
      } }),
      reorder_tasks: tool({ description: "Propose setting the manual priority order of tasks, highest first.", inputSchema: z.object({ orderedIds: z.array(z.string().min(1)).min(1) }), execute: async (args) => {
        const owned = await getDb().select({ id: tasks.id, title: tasks.title }).from(tasks).where(eq(tasks.userId, input.workspaceId));
        const allowed = new Set(owned.map((task) => task.id));
        if (args.orderedIds.some((id) => !allowed.has(id))) throw new TRPCError({ code: "BAD_REQUEST", message: "Task order contains an unknown task" });
        return propose("reorder_tasks", { ...args, workspaceId: input.workspaceId }, `调整 ${args.orderedIds.length} 项任务的优先顺序`);
      } }),
    };
    let result;
    try {
      result = await generateText({ model: assistantProvider(model.provider, model.baseUrl, model.apiKey)(model.model), system, messages: [...history, { role: "user", content: input.message }], tools, stopWhen: stepCountIs(5), maxOutputTokens: 1800 });
    } catch (error) {
      const classified = classifyAiError(error);
      throw new TRPCError({ code: "BAD_REQUEST", message: classified.message || "The assistant could not complete this request" });
    }
    const text = result.text.trim() || (proposalIds.length ? `已生成 ${proposalIds.length} 项待确认操作，请确认后执行。` : "已完成。");
    const messageId = crypto.randomUUID();
    await db.insert(assistantMessages).values({ id: messageId, ownerUnionId: ctx.user.unionId, workspaceId: input.workspaceId, modelId: model.id, role: "assistant", content: text, createdAt: Date.now() });
    if (proposalIds.length) await db.update(assistantActions).set({ messageId }).where(inArray(assistantActions.id, proposalIds));
    const actions = proposalIds.length ? await db.select().from(assistantActions).where(inArray(assistantActions.id, proposalIds)) : [];
    return { text, actions, model: { id: model.id, name: model.name, provider: model.provider }, tasks: await listTasks(input.workspaceId) };
  }),
});
