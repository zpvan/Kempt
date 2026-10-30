import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

export const taskDraftKey = (userId: string, taskId: string) => `kempt.draft.task.${userId}.${taskId}`;
export const taskItemsDraftKey = (userId: string, taskId: string) => `kempt.draft.checklist.${userId}.${taskId}`;
export const progressDraftKey = (userId: string, taskId: string) => `kempt.draft.progress.${userId}.${taskId}`;
export const logDraftKey = (userId: string, logId: string) => `kempt.draft.log.${userId}.${logId}`;

export function useDraftState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) as T : initial;
    } catch {
      return initial;
    }
  });
  const [restored] = useState(() => localStorage.getItem(key) !== null);
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue, restored];
}

export function clearDraft(...keys: string[]) {
  keys.forEach((key) => localStorage.removeItem(key));
}
