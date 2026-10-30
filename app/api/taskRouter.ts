import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { listTasks, logValues, taskUpdateValues, taskValues } from "./queries/tasks";
import { assertWorkspaceAccess } from "./queries/workspaces";
import { checklistItems, tasks, workLogs } from "@db/schema";
import type { Task } from "@contracts/types";

export const statusSchema = z.enum(["todo", "doing", "done"]);
export const userIdSchema = z.string().min(1).max(64);
export const logSchema = z.object({
  id: z.string().min(1).max(191),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  content: z.string().min(1),
  progress: z.number().int().min(0).max(100),
  status: statusSchema,
  createdAt: z.number().finite(),
});
export const checklistSchema = z.object({
  id: z.string().min(1).max(191),
  content: z.string().trim().min(1).max(500),
  completed: z.boolean(),
  position: z.number().int().min(0),
  createdAt: z.number().finite(),
});
export const taskSchema = z.object({
  id: z.string().min(1).max(191),
  title: z.string().min(1).max(500),
  description: z.string(),
  project: z.string().min(1).max(255),
  status: statusSchema,
  priority: z.enum(["low", "medium", "high"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  progress: z.number().int().min(0).max(100),
  position: z.number().int().min(0).optional(),
  parentId: z.string().max(191).optional(),
  sourceUrl: z.string().optional(),
  logs: z.array(logSchema).optional(),
  checklist: z.array(checklistSchema).max(200).optional(),
  createdAt: z.number().finite(),
});

function normalizedTask(task: Task): Task {
  const checklist = (task.checklist ?? []).map((item, position) => ({ ...item, completed: task.status === "done" ? true : item.completed, position }));
  const allDone = checklist.length > 0 && checklist.every((item) => item.completed);
  const status = allDone ? "done" : task.status;
  const progress = checklist.length ? (status === "done" ? 100 : Math.round(checklist.filter((item) => item.completed).length / checklist.length * 100)) : status === "done" ? 100 : task.progress;
  return { ...task, status, progress, checklist };
}

function checklistValues(taskId: string, task: Task) {
  return (task.checklist ?? []).map((item, position) => ({ id: item.id, taskId, content: item.content, completed: item.completed, position, createdAt: item.createdAt }));
}

async function assertTaskOwnership(taskId: string, userId: string) {
  const [existing] = await getDb().select({ userId: tasks.userId }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (existing && existing.userId !== userId) throw new TRPCError({ code: "CONFLICT", message: "Task id belongs to another user" });
}

async function assertLogOwnership(logId: string, userId: string) {
  const [existing] = await getDb().select({ taskId: workLogs.taskId }).from(workLogs).innerJoin(tasks, eq(workLogs.taskId, tasks.id)).where(and(eq(workLogs.id, logId), eq(tasks.userId, userId))).limit(1);
  if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Work log not found for this user" });
}

export const taskRouter = createRouter({
  list: authedQuery.input(z.object({ userId: userIdSchema })).query(async ({ ctx, input }) => { await assertWorkspaceAccess(input.userId, ctx.user.unionId); return listTasks(input.userId); }),
  trash: authedQuery.input(z.object({ userId: userIdSchema })).query(async ({ ctx, input }) => { await assertWorkspaceAccess(input.userId, ctx.user.unionId); return listTasks(input.userId, true); }),
  upsert: authedQuery.input(z.object({ userId: userIdSchema, task: taskSchema })).mutation(async ({ ctx, input }) => { await assertWorkspaceAccess(input.userId, ctx.user.unionId);
    await assertTaskOwnership(input.task.id, input.userId);
    const task = normalizedTask(input.task);
    await getDb().transaction(async (tx) => {
      await tx.insert(tasks).values(taskValues(task, input.userId)).onDuplicateKeyUpdate({ set: taskUpdateValues(task, input.userId) });
      await tx.delete(checklistItems).where(eq(checklistItems.taskId, task.id));
      const items = checklistValues(task.id, task);
      if (items.length) await tx.insert(checklistItems).values(items);
    });
    return listTasks(input.userId);
  }),
  delete: authedQuery.input(z.object({ userId: userIdSchema, id: z.string().min(1) })).mutation(async ({ ctx, input }) => { await assertWorkspaceAccess(input.userId, ctx.user.unionId);
    await getDb().update(tasks).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(tasks.userId, input.userId), or(eq(tasks.id, input.id), eq(tasks.parentId, input.id))));
    return listTasks(input.userId);
  }),
  restore: authedQuery.input(z.object({ userId: userIdSchema, id: z.string().min(1) })).mutation(async ({ ctx, input }) => { await assertWorkspaceAccess(input.userId, ctx.user.unionId);
    await getDb().update(tasks).set({ deletedAt: null, updatedAt: new Date() }).where(and(eq(tasks.userId, input.userId), or(eq(tasks.id, input.id), eq(tasks.parentId, input.id))));
    return listTasks(input.userId);
  }),
  purge: authedQuery.input(z.object({ userId: userIdSchema, id: z.string().min(1) })).mutation(async ({ ctx, input }) => { await assertWorkspaceAccess(input.userId, ctx.user.unionId);
    await getDb().delete(tasks).where(and(eq(tasks.userId, input.userId), eq(tasks.id, input.id)));
    return listTasks(input.userId, true);
  }),
  reorder: authedQuery.input(z.object({ userId: userIdSchema, orderedIds: z.array(z.string().min(1).max(191)).min(1).max(5000) })).mutation(async ({ ctx, input }) => { await assertWorkspaceAccess(input.userId, ctx.user.unionId);
    await getDb().transaction(async (tx) => {
      for (const [index, id] of input.orderedIds.entries()) await tx.update(tasks).set({ position: (index + 1) * 100, updatedAt: new Date() }).where(and(eq(tasks.id, id), eq(tasks.userId, input.userId)));
    });
    return listTasks(input.userId);
  }),
  setStatus: authedQuery.input(z.object({ userId: userIdSchema, id: z.string().min(1), status: statusSchema })).mutation(async ({ ctx, input }) => { await assertWorkspaceAccess(input.userId, ctx.user.unionId);
    await getDb().transaction(async (tx) => {
      if (input.status === "done") await tx.update(checklistItems).set({ completed: true }).where(eq(checklistItems.taskId, input.id));
      await tx.update(tasks).set({ status: input.status, position: 0, ...(input.status === "done" ? { progress: 100 } : {}), updatedAt: new Date() }).where(and(eq(tasks.id, input.id), eq(tasks.userId, input.userId)));
    });
    return listTasks(input.userId);
  }),
  addLog: authedQuery.input(z.object({ userId: userIdSchema, taskId: z.string().min(1), log: logSchema })).mutation(async ({ ctx, input }) => { await assertWorkspaceAccess(input.userId, ctx.user.unionId);
    await getDb().transaction(async (tx) => {
      const [owner] = await tx.select({ userId: tasks.userId }).from(tasks).where(eq(tasks.id, input.taskId)).limit(1);
      if (!owner || owner.userId !== input.userId) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found for this user" });
      const items = await tx.select().from(checklistItems).where(eq(checklistItems.taskId, input.taskId));
      if (input.log.status === "done" && items.length) await tx.update(checklistItems).set({ completed: true }).where(eq(checklistItems.taskId, input.taskId));
      const completed = input.log.status === "done" ? items.length : items.filter((item) => item.completed).length;
      const allDone = items.length > 0 && completed === items.length;
      const status = input.log.status === "done" || allDone ? "done" : input.log.status;
      const progress = items.length ? (status === "done" ? 100 : Math.round(completed / items.length * 100)) : status === "done" ? 100 : input.log.progress;
      await tx.insert(workLogs).values({ ...logValues(input.taskId, input.log), status, progress });
      await tx.update(tasks).set({ progress, status, updatedAt: new Date() }).where(and(eq(tasks.id, input.taskId), eq(tasks.userId, input.userId)));
    });
    return listTasks(input.userId);
  }),
  updateLog: authedQuery.input(z.object({ userId: userIdSchema, log: logSchema })).mutation(async ({ ctx, input }) => { await assertWorkspaceAccess(input.userId, ctx.user.unionId);
    await assertLogOwnership(input.log.id, input.userId);
    await getDb().update(workLogs).set({ date: input.log.date, content: input.log.content, progress: input.log.progress, status: input.log.status }).where(eq(workLogs.id, input.log.id));
    return listTasks(input.userId);
  }),
  deleteLog: authedQuery.input(z.object({ userId: userIdSchema, id: z.string().min(1) })).mutation(async ({ ctx, input }) => { await assertWorkspaceAccess(input.userId, ctx.user.unionId);
    await assertLogOwnership(input.id, input.userId);
    await getDb().delete(workLogs).where(eq(workLogs.id, input.id));
    return listTasks(input.userId);
  }),
  import: authedQuery.input(z.object({ userId: userIdSchema, tasks: z.array(taskSchema).max(5000) })).mutation(async ({ ctx, input }) => { await assertWorkspaceAccess(input.userId, ctx.user.unionId);
    for (const task of input.tasks) await assertTaskOwnership(task.id, input.userId);
    await getDb().transaction(async (tx) => {
      for (const original of input.tasks) {
        const task = normalizedTask(original);
        await tx.insert(tasks).values(taskValues(task, input.userId)).onDuplicateKeyUpdate({ set: taskUpdateValues(task, input.userId) });
        await tx.delete(checklistItems).where(eq(checklistItems.taskId, task.id));
        const items = checklistValues(task.id, task);
        if (items.length) await tx.insert(checklistItems).values(items);
        for (const log of task.logs ?? []) {
          await tx.insert(workLogs).values(logValues(task.id, log)).onDuplicateKeyUpdate({
            set: { date: log.date, content: log.content, progress: log.progress, status: log.status, createdAt: log.createdAt },
          });
        }
      }
    });
    return listTasks(input.userId);
  }),
});
