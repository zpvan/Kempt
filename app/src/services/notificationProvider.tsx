import { createContext, useContext, type ReactNode } from "react";
import type { NotificationPort } from "./notifications";

const NotificationContext = createContext<NotificationPort | null>(null);

export function NotificationProvider({ notifications, children }: { notifications: NotificationPort; children: ReactNode }) {
  return <NotificationContext.Provider value={notifications}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const notifications = useContext(NotificationContext);
  if (!notifications) throw new Error("NotificationProvider is missing");
  return notifications;
}
