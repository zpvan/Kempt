export interface NotificationPort {
  isGranted(): Promise<boolean>;
  notify(title: string, body: string): Promise<void>;
}

export class BrowserNotificationPort implements NotificationPort {
  async isGranted() {
    return "Notification" in window && Notification.permission === "granted";
  }

  async notify(title: string, body: string) {
    new Notification(title, { body });
  }
}

export class TauriNotificationPort implements NotificationPort {
  async isGranted() {
    const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification");
    return (await isPermissionGranted()) || (await requestPermission()) === "granted";
  }

  async notify(title: string, body: string) {
    const { sendNotification } = await import("@tauri-apps/plugin-notification");
    sendNotification({ title, body });
  }
}
