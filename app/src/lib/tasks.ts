import { addDays, format, startOfDay } from "date-fns";
import type { ChecklistItem, Priority, Status, Task, WorkLog } from "@contracts/types";
import type { Language } from "./i18n";

export type { ChecklistItem, Priority, Status, Task, WorkLog };

export const statusMeta: Record<Status, { label: string; hint: string }> = {
  todo: { label: "待开始", hint: "准备就绪" },
  doing: { label: "进行中", hint: "保持专注" },
  done: { label: "已完成", hint: "漂亮收官" },
};

export const priorityMeta: Record<Priority, string> = { low: "低", medium: "中", high: "高" };

const day = (offset: number) => format(addDays(startOfDay(new Date()), offset), "yyyy-MM-dd");
const task = (id: string, title: string, description: string, project: string, status: Status, priority: Priority, start: number, due: number, progress: number): Task => ({
  id, title, description, project, status, priority,
  startDate: day(start), dueDate: day(due), progress, createdAt: Date.now() - (Number(id.replace(/\D/g, "")) || 0),
});

export function excelTasks(): Task[] {
  return [
    {
      ...task("excel-1", "部校数据网络高校节点数据暨本科专业评估数据采集工作", "请教流程，10月29日前报送《采集人员信息表》，邮件公文报送", "教学评估", "todo", "medium", 0, 31, 0),
      sourceUrl: "https://www1.szu.edu.cn/board/view.asp?id=585690",
      startDate: "2026-10-23", dueDate: "2026-11-23",
    },
    {
      ...task("excel-2", "本科毕业论文（设计）工作领导小组", "", "毕业论文", "todo", "medium", 0, 7, 0),
      sourceUrl: "https://www1.szu.edu.cn/board/view.asp?id=585662",
      startDate: "2026-10-23", dueDate: "2026-10-30",
    },
    {
      ...task("excel-3", "本科毕业论文（设计）前期自查", "开题、自查报告", "毕业论文", "todo", "high", 0, 85, 0),
      startDate: "2026-10-23", dueDate: "2027-01-16",
    },
  ];
}

export const emptyTask = (): Omit<Task, "id" | "createdAt"> => ({
  title: "", description: "", project: "个人工作", status: "todo", priority: "medium",
  startDate: day(0), dueDate: day(3), progress: 0,
});

export const formatShort = (date: string, language: Language = "zh") => format(new Date(`${date}T12:00:00`), language === "zh" ? "M月d日" : "MMM d");
export const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
export const checklistProgress = (items: ChecklistItem[] = []) => items.length ? Math.round(items.filter((item) => item.completed).length / items.length * 100) : 0;
export const overallProgress = (tasks: Task[]) => tasks.length ? Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length) : 0;

const validDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`));

export function parseTaskImport(input: unknown, language: Language = "zh"): Task[] {
  const message = (zh: string, en: string) => language === "zh" ? zh : en;
  const raw = Array.isArray(input) ? input : (input as { tasks?: unknown })?.tasks;
  if (!Array.isArray(raw)) throw new Error(message("JSON 中未找到 tasks 任务数组", "No tasks array was found in the JSON"));
  const ids = new Set<string>();
  const tasks = raw.map((item, index): Task => {
    if (!item || typeof item !== "object") throw new Error(message(`第 ${index + 1} 项任务格式不正确`, `Task ${index + 1} has an invalid format`));
    const value = item as Record<string, unknown>;
    if (typeof value.id !== "string" || !value.id.trim()) throw new Error(message(`第 ${index + 1} 项任务缺少 id`, `Task ${index + 1} is missing an id`));
    if (ids.has(value.id)) throw new Error(message(`任务 id 重复：${value.id}`, `Duplicate task id: ${value.id}`));
    ids.add(value.id);
    if (typeof value.title !== "string" || value.title.trim().length < 2) throw new Error(message(`第 ${index + 1} 项任务标题无效`, `Task ${index + 1} has an invalid title`));
    if (!validDate(value.startDate) || !validDate(value.dueDate) || value.dueDate < value.startDate) throw new Error(message(`任务“${value.title}”的开始或截止日期无效`, `Task “${value.title}” has an invalid start or due date`));
    const status = value.status === "doing" || value.status === "done" ? value.status : "todo";
    const priority = value.priority === "high" || value.priority === "low" ? value.priority : "medium";
    const logs: WorkLog[] = Array.isArray(value.logs) ? value.logs.flatMap((entry): WorkLog[] => {
      if (!entry || typeof entry !== "object") return [];
      const log = entry as Record<string, unknown>;
      if (typeof log.id !== "string" || typeof log.content !== "string" || !validDate(log.date)) return [];
      return [{ id: log.id, date: log.date, content: log.content, progress: typeof log.progress === "number" && Number.isFinite(log.progress) ? Math.max(0, Math.min(100, log.progress)) : 0, status: log.status === "doing" || log.status === "done" ? log.status : "todo", createdAt: typeof log.createdAt === "number" && Number.isFinite(log.createdAt) ? log.createdAt : Date.now() }];
    }) : [];
    const checklist: ChecklistItem[] = Array.isArray(value.checklist) ? value.checklist.flatMap((entry, position): ChecklistItem[] => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      if (typeof item.id !== "string" || typeof item.content !== "string" || !item.content.trim()) return [];
      return [{ id: item.id, content: item.content.trim(), completed: item.completed === true, position, createdAt: typeof item.createdAt === "number" && Number.isFinite(item.createdAt) ? item.createdAt : Date.now() }];
    }) : [];
    return {
      id: value.id,
      title: value.title.trim(),
      description: typeof value.description === "string" ? value.description : "",
      project: typeof value.project === "string" && value.project.trim() ? value.project.trim() : message("个人工作", "Personal work"),
      status,
      priority,
      startDate: value.startDate,
      dueDate: value.dueDate,
      progress: typeof value.progress === "number" && Number.isFinite(value.progress) ? Math.max(0, Math.min(100, value.progress)) : status === "done" ? 100 : 0,
      position: typeof value.position === "number" && Number.isFinite(value.position) ? Math.max(0, Math.round(value.position)) : 0,
      parentId: typeof value.parentId === "string" ? value.parentId : undefined,
      sourceUrl: typeof value.sourceUrl === "string" ? value.sourceUrl : undefined,
      logs,
      checklist,
      createdAt: typeof value.createdAt === "number" && Number.isFinite(value.createdAt) ? value.createdAt : Date.now() + index,
      deletedAt: typeof value.deletedAt === "string" && !Number.isNaN(Date.parse(value.deletedAt)) ? new Date(value.deletedAt) : undefined,
    };
  });
  if (!tasks.length) throw new Error(message("JSON 中没有可导入的任务", "The JSON contains no tasks to import"));
  return tasks;
}
