import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "./connection";
import { checklistItems, tasks, workLogs } from "@db/schema";
import type { Task, WorkLog } from "@contracts/types";

export async function listTasks(userId: string, trash = false): Promise<Task[]> {
  const db = getDb();
  const visibility = trash ? isNotNull(tasks.deletedAt) : isNull(tasks.deletedAt);
  const [taskRows, logRows, checklistRows] = await Promise.all([
    db.select().from(tasks).where(and(eq(tasks.userId, userId), visibility)).orderBy(asc(tasks.position), desc(tasks.createdAt)),
    db.select().from(workLogs).orderBy(desc(workLogs.createdAt)),
    db.select().from(checklistItems).orderBy(asc(checklistItems.position), asc(checklistItems.createdAt)),
  ]);
  return taskRows.map((row) => ({
    id: row.id,
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
    deletedAt: row.deletedAt ?? undefined,
    logs: logRows.filter((log) => log.taskId === row.id).map((log) => ({
      id: log.id,
      date: log.date,
      content: log.content,
      progress: log.progress,
      status: log.status,
      createdAt: log.createdAt,
    })),
    checklist: checklistRows.filter((item) => item.taskId === row.id).map((item) => ({
      id: item.id,
      content: item.content,
      completed: item.completed,
      position: item.position,
      createdAt: item.createdAt,
    })),
  }));
}

export function taskValues(task: Task, userId: string) {
  return {
    id: task.id,
    userId,
    title: task.title,
    description: task.description,
    project: task.project,
    status: task.status,
    priority: task.priority,
    startDate: task.startDate,
    dueDate: task.dueDate,
    progress: task.progress,
    position: task.position ?? 0,
    parentId: task.parentId ?? null,
    sourceUrl: task.sourceUrl ?? null,
    createdAt: task.createdAt,
    updatedAt: new Date(),
    deletedAt: null,
  };
}

export function taskUpdateValues(task: Task, userId: string) {
  const { id: _id, createdAt: _createdAt, userId: _userId, ...values } = taskValues(task, userId);
  return values;
}

export function logValues(taskId: string, log: WorkLog) {
  return {
    id: log.id,
    taskId,
    date: log.date,
    content: log.content,
    progress: log.progress,
    status: log.status,
    createdAt: log.createdAt,
  };
}
