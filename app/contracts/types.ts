export type Status = "todo" | "doing" | "done";
export type Priority = "low" | "medium" | "high";

export interface WorkLog {
  id: string;
  date: string;
  content: string;
  progress: number;
  status: Status;
  createdAt: number;
}

export interface ChecklistItem {
  id: string;
  content: string;
  completed: boolean;
  position: number;
  createdAt: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  project: string;
  status: Status;
  priority: Priority;
  startDate: string;
  dueDate: string;
  progress: number;
  position?: number;
  parentId?: string;
  sourceUrl?: string;
  logs?: WorkLog[];
  checklist?: ChecklistItem[];
  createdAt: number;
  deletedAt?: Date;
}

export interface BackupUser {
  id: string;
  ownerUnionId?: string | null;
  name: string;
  isDefault: boolean;
  createdAt?: string;
}

export interface BackupTask extends Omit<Task, "deletedAt" | "parentId" | "sourceUrl"> {
  userId: string;
  parentId?: string | null;
  sourceUrl?: string | null;
  deletedAt?: string | null;
}

export interface FullBackup {
  app: string;
  format: "kempt-full-backup";
  version: 2;
  exportedAt: string;
  users: BackupUser[];
  tasks: BackupTask[];
  preferences?: {
    theme?: "light" | "dark";
    language?: "zh" | "en";
    currentUser?: string;
  };
}

export type * from "../db/schema";
export * from "./errors";
