import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { listWorkspaces } from "./queries/workspaces";
import { taskValues } from "./queries/tasks";
import { taskSchema } from "./taskRouter";
import { appUsers, checklistItems, tasks, workLogs } from "@db/schema";
import type { Task } from "@contracts/types";

const backupUserSchema = z.object({
  id: z.string().min(1).max(64),
  ownerUnionId: z.string().max(255).nullable().optional(),
  name: z.string().min(1).max(100),
  isDefault: z.boolean(),
  createdAt: z.string().optional(),
});
const backupTaskSchema = taskSchema.extend({
  userId: z.string().min(1).max(64),
  parentId: z.string().max(191).nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  deletedAt: z.string().nullable().optional(),
});
const backupSchema = z.object({
  app: z.string(),
  format: z.literal("kempt-full-backup"),
  version: z.literal(2),
  exportedAt: z.string(),
  users: z.array(backupUserSchema).min(1).max(1000),
  tasks: z.array(backupTaskSchema).max(20000),
  preferences: z.object({
    theme: z.enum(["light", "dark"]).optional(),
    language: z.enum(["zh", "en"]).optional(),
    currentUser: z.string().optional(),
  }).optional(),
});

export const backupRouter = createRouter({
  export: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const workspaces = await listWorkspaces(ctx.user.unionId);
    const workspaceIds = workspaces.map((workspace) => workspace.id);
    const taskRows = workspaceIds.length ? await db.select().from(tasks).where(inArray(tasks.userId, workspaceIds)).orderBy(desc(tasks.createdAt)) : [];
    const taskIds = taskRows.map((task) => task.id);
    const [logRows, checklistRows] = await Promise.all([
      taskIds.length ? db.select().from(workLogs).where(inArray(workLogs.taskId, taskIds)).orderBy(desc(workLogs.createdAt)) : [],
      taskIds.length ? db.select().from(checklistItems).where(inArray(checklistItems.taskId, taskIds)) : [],
    ]);
    return {
      app: "Kempt",
      format: "kempt-full-backup" as const,
      version: 2 as const,
      exportedAt: new Date().toISOString(),
      users: workspaces.map((user) => ({ id: user.id, ownerUnionId: user.ownerUnionId, name: user.name, isDefault: user.isDefault, createdAt: user.createdAt.toISOString() })),
      tasks: taskRows.map((row) => ({
        id: row.id,
        userId: row.userId,
        title: row.title,
        description: row.description,
        project: row.project,
        status: row.status,
        priority: row.priority,
        startDate: row.startDate,
        dueDate: row.dueDate,
        progress: row.progress,
        position: row.position,
        parentId: row.parentId ?? undefined,
        sourceUrl: row.sourceUrl ?? undefined,
        createdAt: row.createdAt,
        deletedAt: row.deletedAt?.toISOString() ?? null,
        logs: logRows.filter((log) => log.taskId === row.id).map((log) => ({ id: log.id, date: log.date, content: log.content, progress: log.progress, status: log.status, createdAt: log.createdAt })),
        checklist: checklistRows.filter((item) => item.taskId === row.id).map((item) => ({ id: item.id, content: item.content, completed: item.completed, position: item.position, createdAt: item.createdAt })),
      })),
    };
  }),
  restore: authedQuery.input(z.object({ backup: backupSchema })).mutation(async ({ ctx, input }) => {
    const { backup } = input;
    const unionId = ctx.user.unionId;
    const currentWorkspaces = await listWorkspaces(unionId);
    const currentOwners = new Map(currentWorkspaces.map((workspace) => [workspace.id, workspace.ownerUnionId]));
    for (const user of backup.users) {
      const owner = user.ownerUnionId ?? currentOwners.get(user.id);
      if (owner !== unionId) throw new TRPCError({ code: "FORBIDDEN", message: "Backup contains another account's workspace" });
    }
    const userIds = new Set(backup.users.map((user) => user.id));
    if (backup.tasks.some((task) => !userIds.has(task.userId))) throw new TRPCError({ code: "BAD_REQUEST", message: "Backup contains a task with an unknown user" });
    const currentTaskRows = currentWorkspaces.length ? await getDb().select({ id: tasks.id }).from(tasks).where(inArray(tasks.userId, currentWorkspaces.map((workspace) => workspace.id))) : [];
    const currentTaskIds = currentTaskRows.map((task) => task.id);
    await getDb().transaction(async (tx) => {
      if (currentTaskIds.length) {
        await tx.delete(checklistItems).where(inArray(checklistItems.taskId, currentTaskIds));
        await tx.delete(workLogs).where(inArray(workLogs.taskId, currentTaskIds));
      }
      await tx.delete(tasks).where(inArray(tasks.userId, currentWorkspaces.map((workspace) => workspace.id)));
      await tx.delete(appUsers).where(eq(appUsers.ownerUnionId, unionId));
      await tx.insert(appUsers).values(backup.users.map((user) => ({ id: user.id, ownerUnionId: unionId, name: user.name, isDefault: user.isDefault, createdAt: user.createdAt ? new Date(user.createdAt) : new Date() })));
      for (const backupTask of backup.tasks) {
        const { userId, deletedAt, ...content } = backupTask;
        const task = { ...content, deletedAt: deletedAt ? new Date(deletedAt) : undefined } as Task;
        await tx.insert(tasks).values({ ...taskValues(task, userId), deletedAt: deletedAt ? new Date(deletedAt) : null });
        const logs = (backupTask.logs ?? []).map((log) => ({ id: log.id, taskId: backupTask.id, date: log.date, content: log.content, progress: log.progress, status: log.status, createdAt: log.createdAt }));
        if (logs.length) await tx.insert(workLogs).values(logs);
        const items = (backupTask.checklist ?? []).map((item, position) => ({ id: item.id, taskId: backupTask.id, content: item.content, completed: item.completed, position, createdAt: item.createdAt }));
        if (items.length) await tx.insert(checklistItems).values(items);
      }
    });
    return {
      users: await listWorkspaces(unionId),
      tasks: backup.tasks.length,
      logs: backup.tasks.reduce((sum, task) => sum + (task.logs?.length || 0), 0),
      checklist: backup.tasks.reduce((sum, task) => sum + (task.checklist?.length || 0), 0),
      deletedTasks: backup.tasks.filter((task) => task.deletedAt).length,
    };
  }),
});
