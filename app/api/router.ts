import { createRouter, publicQuery } from "./middleware";
import { taskRouter } from "./taskRouter";
import { userRouter } from "./userRouter";
import { backupRouter } from "./backupRouter";
import { authRouter } from "./auth-router";
import { assistantRouter } from "./assistantRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  task: taskRouter,
  user: userRouter,
  backup: backupRouter,
  assistant: assistantRouter,
});

export type AppRouter = typeof appRouter;
