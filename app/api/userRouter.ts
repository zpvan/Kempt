import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { listWorkspaces, assertWorkspaceAccess } from "./queries/workspaces";
import { appUsers, tasks } from "@db/schema";

export const userRouter = createRouter({
  list: authedQuery.query(({ ctx }) => listWorkspaces(ctx.user.unionId, ctx.user.name || ctx.user.username || undefined)),
  create: authedQuery.input(z.object({ name: z.string().trim().min(1).max(40) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const [existing] = await db.select({ id: appUsers.id }).from(appUsers).where(and(eq(appUsers.ownerUnionId, ctx.user.unionId), eq(appUsers.name, input.name))).limit(1);
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "User name already exists" });
    const user = { id: crypto.randomUUID(), ownerUnionId: ctx.user.unionId, name: input.name, isDefault: false };
    await db.insert(appUsers).values(user);
    return { user, users: await listWorkspaces(ctx.user.unionId) };
  }),
  delete: authedQuery.input(z.object({ id: z.string().min(1).max(64) })).mutation(async ({ ctx, input }) => {
    await assertWorkspaceAccess(input.id, ctx.user.unionId);
    const db = getDb();
    const [user] = await db.select().from(appUsers).where(eq(appUsers.id, input.id)).limit(1);
    if (user?.isDefault || input.id === "shella") throw new TRPCError({ code: "BAD_REQUEST", message: "The default user cannot be deleted" });
    if (user) {
      await db.transaction(async (tx) => {
        await tx.delete(tasks).where(eq(tasks.userId, input.id));
        await tx.delete(appUsers).where(eq(appUsers.id, input.id));
      });
    }
    return listWorkspaces(ctx.user.unionId);
  }),
});
