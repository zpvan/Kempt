import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { assistantModels } from "@db/schema";
import { decryptSecret, encryptSecret } from "../security/secret";
import { availableModels, assertProviderUrl } from "./provider";

async function listModels(ownerUnionId: string) {
  const rows = await getDb().select().from(assistantModels).where(eq(assistantModels.ownerUnionId, ownerUnionId)).orderBy(desc(assistantModels.isDefault), asc(assistantModels.createdAt));
  return rows.map((row) => ({ id: row.id, provider: row.provider, name: row.name, baseUrl: row.baseUrl, model: row.model, isDefault: row.isDefault, createdAt: row.createdAt }));
}

async function ownedModel(id: string, ownerUnionId: string) {
  const [model] = await getDb().select().from(assistantModels).where(and(eq(assistantModels.id, id), eq(assistantModels.ownerUnionId, ownerUnionId))).limit(1);
  if (!model) throw new TRPCError({ code: "NOT_FOUND", message: "Model configuration not found" });
  return model;
}

export const assistantModelRouter = createRouter({
  list: authedQuery.query(({ ctx }) => listModels(ctx.user.unionId)),
  available: authedQuery.input(z.object({ id: z.string().max(64).optional(), provider: z.enum(["kimi", "minimax"]), baseUrl: z.string().trim().url().optional(), apiKey: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
    const existing = input.id ? await ownedModel(input.id, ctx.user.unionId) : undefined;
    const apiKey = input.apiKey || (existing?.provider === "minimax" ? decryptSecret(existing.apiKeyCiphertext) : "");
    if (input.provider === "minimax" && !apiKey) throw new TRPCError({ code: "BAD_REQUEST", message: "MiniMax API key is required" });
    try {
      return await availableModels(input.provider, input.baseUrl || existing?.baseUrl || "https://api.minimax.cn/v1", apiKey);
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Could not read provider models" });
    }
  }),
  save: authedQuery.input(z.object({
    id: z.string().max(64).optional(),
    provider: z.enum(["kimi", "minimax"]),
    name: z.string().trim().min(1).max(100),
    baseUrl: z.string().trim().url(),
    model: z.string().trim().min(1).max(200),
    apiKey: z.string().trim().min(10).max(500).optional(),
  })).mutation(async ({ ctx, input }) => {
    assertProviderUrl(input.provider, input.baseUrl);
    const existing = input.id ? await ownedModel(input.id, ctx.user.unionId) : undefined;
    const apiKey = input.provider === "minimax" ? input.apiKey || (existing ? decryptSecret(existing.apiKeyCiphertext) : "") : "";
    if (input.provider === "minimax" && !apiKey) throw new TRPCError({ code: "BAD_REQUEST", message: "MiniMax API key is required" });
    try {
      const available = await availableModels(input.provider, input.baseUrl, apiKey);
      if (!available.models.some((model) => model.id === input.model)) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected model is not available for this account" });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Model connection failed" });
    }
    const db = getDb();
    const currentModels = await db.select({ id: assistantModels.id }).from(assistantModels).where(eq(assistantModels.ownerUnionId, ctx.user.unionId));
    const isDefault = existing?.isDefault || currentModels.length === 0;
    if (existing) {
      await db.update(assistantModels).set({ provider: input.provider, name: input.name, baseUrl: input.baseUrl, model: input.model, apiKeyCiphertext: encryptSecret(apiKey) }).where(and(eq(assistantModels.id, existing.id), eq(assistantModels.ownerUnionId, ctx.user.unionId)));
    } else {
      await db.insert(assistantModels).values({ id: crypto.randomUUID(), ownerUnionId: ctx.user.unionId, provider: input.provider, name: input.name, baseUrl: input.baseUrl, model: input.model, apiKeyCiphertext: encryptSecret(apiKey), isDefault });
    }
    return listModels(ctx.user.unionId);
  }),
  setDefault: authedQuery.input(z.object({ id: z.string().min(1).max(64) })).mutation(async ({ ctx, input }) => {
    await ownedModel(input.id, ctx.user.unionId);
    await getDb().update(assistantModels).set({ isDefault: false }).where(eq(assistantModels.ownerUnionId, ctx.user.unionId));
    await getDb().update(assistantModels).set({ isDefault: true }).where(and(eq(assistantModels.id, input.id), eq(assistantModels.ownerUnionId, ctx.user.unionId)));
    return listModels(ctx.user.unionId);
  }),
  delete: authedQuery.input(z.object({ id: z.string().min(1).max(64) })).mutation(async ({ ctx, input }) => {
    const existing = await ownedModel(input.id, ctx.user.unionId);
    await getDb().delete(assistantModels).where(and(eq(assistantModels.id, input.id), eq(assistantModels.ownerUnionId, ctx.user.unionId)));
    if (existing.isDefault) {
      const [next] = await getDb().select({ id: assistantModels.id }).from(assistantModels).where(eq(assistantModels.ownerUnionId, ctx.user.unionId)).orderBy(asc(assistantModels.createdAt)).limit(1);
      if (next) await getDb().update(assistantModels).set({ isDefault: true }).where(eq(assistantModels.id, next.id));
    }
    return listModels(ctx.user.unionId);
  }),
});

export async function resolveAssistantModel(id: string | undefined, ownerUnionId: string) {
  const db = getDb();
  const [model] = await db.select().from(assistantModels).where(and(eq(assistantModels.ownerUnionId, ownerUnionId), id ? eq(assistantModels.id, id) : eq(assistantModels.isDefault, true))).limit(1);
  if (!model) throw new TRPCError({ code: "NOT_FOUND", message: "No assistant model is configured" });
  return { ...model, apiKey: model.provider === "minimax" ? decryptSecret(model.apiKeyCiphertext) : "" };
}
