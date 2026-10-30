import { createRouter } from "./middleware";
import { assistantModelRouter } from "./assistant/modelRouter";
import { assistantChatRouter } from "./assistant/chatRouter";

export const assistantRouter = createRouter({
  models: assistantModelRouter,
  chat: assistantChatRouter,
});
