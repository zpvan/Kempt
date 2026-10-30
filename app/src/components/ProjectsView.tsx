import { useMemo } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, FolderKanban } from "lucide-react";
import { isBefore, startOfDay } from "date-fns";
import { formatShort, overallProgress, type Task } from "@/lib/tasks";
import { usePreferences } from "@/providers/preferences";

export default function ProjectsView({ tasks, onOpenProject }: { tasks: Task[]; onOpenProject: (project: string) => void }) {
  const { language, t } = usePreferences();
  const projects = useMemo(() => Array.from(new Set(tasks.map((task) => task.project))).map((name) => {
    const items = tasks.filter((task) => task.project === name);
    const done = items.filter((task) => task.status === "done").length;
    const overdue = items.filter((task) => task.status !== "done" && isBefore(new Date(`${task.dueDate}T23:59:59`), startOfDay(new Date()))).length;
    const next = items.filter((task) => task.status !== "done").sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    return { name, items, done, overdue, next, completion: items.length ? Math.round(done / items.length * 100) : 0, progress: overallProgress(items) };
  }).sort((a, b) => (a.next?.dueDate || "9999").localeCompare(b.next?.dueDate || "9999")), [tasks]);
  return <div className="projects-view">
    <section className="projects-intro glass-panel"><div><span className="overline">PROJECTS</span><h2>{t("projectOverview")}</h2><p>{t("projectOverviewDesc")}</p></div><FolderKanban size={28} /></section>
    {projects.length ? <div className="project-grid">{projects.map((project) => <article className="project-card glass-panel" key={project.name}>
      <header><div><span className="project-label">{project.name}</span><h3>{project.name}</h3></div><span className="project-count">{project.items.length}</span></header>
      <div className="project-metrics"><div><span>{t("taskCompletion")}</span><b>{project.completion}%</b><small>{project.done}/{project.items.length}</small></div><div><span>{t("overallProgress")}</span><b>{project.progress}%</b><small>{t("itemsDone", { done: project.done, total: project.items.length })}</small></div></div>
      <div className="project-progress"><i style={{ width: `${project.progress}%` }} /></div>
      <div className="project-next"><CalendarDays size={15} /><span><small>{t("nextDeadline")}</small><b>{project.next ? project.next.title : t("noUpcoming")}</b></span>{project.next && <time>{formatShort(project.next.dueDate, language)}</time>}</div>
      <footer><span className={project.overdue ? "project-overdue" : "project-ok"}>{project.overdue ? t("overdueCount", { count: project.overdue }) : <><CheckCircle2 size={13} />{project.done}/{project.items.length}</>}</span><button className="text-button" onClick={() => onOpenProject(project.name)}>{t("viewProjectWork")}<ArrowRight size={15} /></button></footer>
    </article>)}</div> : <div className="logs-empty glass-panel"><FolderKanban size={30} /><h2>{t("noProjects")}</h2><p>{t("noProjectsHint")}</p></div>}
  </div>;
}
