import { asc, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "./connection";
import { appUsers } from "@db/schema";

export async function listWorkspaces(unionId: string, displayName?: string) {
  const db = getDb();
  const existing = await db.select().from(appUsers).where(eq(appUsers.ownerUnionId, unionId)).orderBy(desc(appUsers.isDefault), asc(appUsers.createdAt));
  if (!existing.length) {
    await db.insert(appUsers).values({ id: crypto.randomUUID(), ownerUnionId: unionId, name: displayName?.trim().slice(0, 100) || "我的工作区", isDefault: true });
    return db.select().from(appUsers).where(eq(appUsers.ownerUnionId, unionId)).orderBy(desc(appUsers.isDefault), asc(appUsers.createdAt));
  }
  return existing;
}

export async function assertWorkspaceAccess(userId: string, unionId: string) {
  const [workspace] = await getDb().select({ id: appUsers.id, ownerUnionId: appUsers.ownerUnionId }).from(appUsers).where(eq(appUsers.id, userId)).limit(1);
  if (!workspace || workspace.ownerUnionId !== unionId) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this workspace" });
}
