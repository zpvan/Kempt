import * as cookie from "cookie";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { createRouter, adminQuery, authedQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users } from "@db/schema";
import { hashPassword, verifyPassword } from "./security/password";
import { createTotpSecret, totpUrl, verifyTotp } from "./security/totp";
import { signSessionToken } from "./kimi/session";
import { env } from "./lib/env";

const attempts = new Map<string, { count: number; resetAt: number }>();
const loginInput = z.object({
  identifier: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(128),
  code: z.string().regex(/^\d{6}$/).optional(),
});

function assertLoginAllowed(key: string) {
  const current = attempts.get(key);
  if (current && current.resetAt > Date.now() && current.count >= 5) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many failed attempts. Try again later." });
}
function recordFailure(key: string) {
  const current = attempts.get(key);
  attempts.set(key, { count: current && current.resetAt > Date.now() ? current.count + 1 : 1, resetAt: Date.now() + 15 * 60 * 1000 });
}

export const authRouter = createRouter({
  me: authedQuery.query((opts) => {
    const { passwordHash: _passwordHash, totpSecret: _totpSecret, ...safeUser } = opts.ctx.user;
    return safeUser;
  }),
  loginLocal: publicQuery.input(loginInput).mutation(async ({ ctx, input }) => {
    const identifier = input.identifier.toLowerCase();
    const ip = ctx.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const attemptKey = `${ip}:${identifier}`;
    assertLoginAllowed(attemptKey);
    const db = getDb();
    const [user] = await db.select().from(users).where(or(eq(users.username, identifier), eq(users.email, identifier))).limit(1);
    const validPassword = user ? verifyPassword(input.password, user.passwordHash) : false;
    const validTotp = user?.totpEnabled ? !!input.code && !!user.totpSecret && verifyTotp(user.totpSecret, input.code) : true;
    if (!user || !validPassword || !validTotp) {
      recordFailure(attemptKey);
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials or verification code" });
    }
    attempts.delete(attemptKey);
    const token = await signSessionToken({ unionId: user.unionId, clientId: env.appId });
    const options = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append("set-cookie", cookie.serialize(Session.cookieName, token, { httpOnly: options.httpOnly, path: options.path, sameSite: options.sameSite?.toLowerCase() as "lax" | "none", secure: options.secure, maxAge: Session.maxAgeMs / 1000 }));
    return { success: true };
  }),
  createLocalAccount: adminQuery.input(z.object({
    username: z.string().trim().min(3).max(100),
    email: z.string().trim().email().optional().or(z.literal("")),
    name: z.string().trim().min(1).max(255).optional(),
    password: z.string().min(10).max(128),
  })).mutation(async ({ input }) => {
    const db = getDb();
    const username = input.username.toLowerCase();
    const email = input.email ? input.email.toLowerCase() : null;
    const conditions = [eq(users.username, username)];
    if (email) conditions.push(eq(users.email, email));
    const [existing] = await db.select({ id: users.id }).from(users).where(or(...conditions)).limit(1);
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "Username or email already exists" });
    await db.insert(users).values({
      unionId: `local:${crypto.randomUUID()}`,
      username,
      email,
      name: input.name || username,
      passwordHash: hashPassword(input.password),
      role: "user",
    });
    return { success: true, username };
  }),
  setupTotp: authedQuery.query(({ ctx }) => {
    const secret = createTotpSecret();
    return { secret, url: totpUrl(secret, ctx.user.username || ctx.user.email || ctx.user.name || "Kimi user"), enabled: ctx.user.totpEnabled };
  }),
  enableTotp: authedQuery.input(z.object({ secret: z.string().min(16), code: z.string().regex(/^\d{6}$/) })).mutation(async ({ ctx, input }) => {
    if (!verifyTotp(input.secret, input.code)) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid verification code" });
    await getDb().update(users).set({ totpSecret: input.secret, totpEnabled: true }).where(eq(users.id, ctx.user.id));
    return { success: true };
  }),
  disableTotp: authedQuery.input(z.object({ code: z.string().regex(/^\d{6}$/) })).mutation(async ({ ctx, input }) => {
    if (ctx.user.totpEnabled && (!ctx.user.totpSecret || !verifyTotp(ctx.user.totpSecret, input.code))) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid verification code" });
    await getDb().update(users).set({ totpSecret: null, totpEnabled: false }).where(and(eq(users.id, ctx.user.id), eq(users.unionId, ctx.user.unionId)));
    return { success: true };
  }),
  logout: authedQuery.mutation(async ({ ctx }) => {
    const opts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append("set-cookie", cookie.serialize(Session.cookieName, "", { httpOnly: opts.httpOnly, path: opts.path, sameSite: opts.sameSite?.toLowerCase() as "lax" | "none", secure: opts.secure, maxAge: 0 }));
    return { success: true };
  }),
});
