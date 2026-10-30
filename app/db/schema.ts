import {
  bigint,
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  serial,
} from "drizzle-orm/mysql-core";

export const workspaceState = mysqlTable("personal_workspace", {
  id: varchar("id", { length: 64 }).primaryKey(),
  initialized: boolean("initialized").default(false).notNull(),
  legacyMigrated: boolean("legacyMigrated").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

export const appUsers = mysqlTable("app_users", {
  id: varchar("id", { length: 64 }).primaryKey(),
  ownerUnionId: varchar("ownerUnionId", { length: 255 }),
  name: varchar("name", { length: 100 }).notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const tasks = mysqlTable("work_tasks", {
  id: varchar("id", { length: 191 }).primaryKey(),
  userId: varchar("userId", { length: 64 }).notNull().default("shella"),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description").notNull(),
  project: varchar("project", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["todo", "doing", "done"]).default("todo").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high"]).default("medium").notNull(),
  startDate: varchar("startDate", { length: 10 }).notNull(),
  dueDate: varchar("dueDate", { length: 10 }).notNull(),
  progress: int("progress").default(0).notNull(),
  position: int("position").default(0).notNull(),
  parentId: varchar("parentId", { length: 191 }),
  sourceUrl: text("sourceUrl"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  deletedAt: timestamp("deletedAt"),
}, (table) => ({
  userIdx: index("work_tasks_user_idx").on(table.userId),
}));

export const workLogs = mysqlTable("task_work_logs", {
  id: varchar("id", { length: 191 }).primaryKey(),
  taskId: varchar("taskId", { length: 191 }).notNull().references(() => tasks.id, { onDelete: "cascade" }),
  date: varchar("date", { length: 10 }).notNull(),
  content: text("content").notNull(),
  progress: int("progress").default(0).notNull(),
  status: mysqlEnum("status", ["todo", "doing", "done"]).default("todo").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export const checklistItems = mysqlTable("task_checklist_items", {
  id: varchar("id", { length: 191 }).primaryKey(),
  taskId: varchar("taskId", { length: 191 }).notNull().references(() => tasks.id, { onDelete: "cascade" }),
  content: varchar("content", { length: 500 }).notNull(),
  completed: boolean("completed").default(false).notNull(),
  position: int("position").default(0).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export const assistantModels = mysqlTable("assistant_models", {
  id: varchar("id", { length: 64 }).primaryKey(),
  ownerUnionId: varchar("ownerUnionId", { length: 255 }).notNull(),
  provider: mysqlEnum("provider", ["kimi", "minimax"]).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  baseUrl: text("baseUrl").notNull(),
  model: varchar("model", { length: 200 }).notNull(),
  apiKeyCiphertext: text("apiKeyCiphertext").notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  ownerIdx: index("assistant_models_owner_idx").on(table.ownerUnionId),
}));

export const assistantMessages = mysqlTable("assistant_messages", {
  id: varchar("id", { length: 191 }).primaryKey(),
  ownerUnionId: varchar("ownerUnionId", { length: 255 }).notNull(),
  workspaceId: varchar("workspaceId", { length: 64 }).notNull(),
  modelId: varchar("modelId", { length: 64 }),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  conversationIdx: index("assistant_messages_conversation_idx").on(table.ownerUnionId, table.workspaceId),
}));

export type WorkspaceState = typeof workspaceState.$inferSelect;
export type AppUser = typeof appUsers.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type WorkLogRow = typeof workLogs.$inferSelect;
export type ChecklistItemRow = typeof checklistItems.$inferSelect;
export type AssistantModel = typeof assistantModels.$inferSelect;
export type AssistantMessage = typeof assistantMessages.$inferSelect;

export const assistantActions = mysqlTable("assistant_actions", {
  id: varchar("id", { length: 191 }).primaryKey(),
  messageId: varchar("messageId", { length: 191 }),
  ownerUnionId: varchar("ownerUnionId", { length: 255 }).notNull(),
  action: varchar("action", { length: 40 }).notNull(),
  payload: text("payload").notNull(),
  summary: varchar("summary", { length: 500 }).notNull(),
  status: varchar("status", { length: 16 }).default("pending").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  decidedAt: bigint("decidedAt", { mode: "number" }),
});

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  username: varchar("username", { length: 100 }).unique(),
  passwordHash: text("passwordHash"),
  totpSecret: text("totpSecret"),
  totpEnabled: boolean("totpEnabled").default(false).notNull(),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type AssistantAction = typeof assistantActions.$inferSelect;
