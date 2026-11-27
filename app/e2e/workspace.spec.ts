import { test, expect, type Locator } from "@playwright/test";

test("defaults to English and persists Chinese selection", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".brand-name")).toHaveText("Kempt");
  await page.locator(".language-button").click();
  await expect(page.locator(".brand-name")).toHaveText("企理");
  await page.reload();
  await expect(page.locator(".brand-name")).toHaveText("企理");
  await page.locator(".language-button").click();
  await expect(page.locator(".brand-name")).toHaveText("Kempt");
});

test("creates and reloads a persisted task", async ({ page }) => {
  await page.goto("/");
  await page.locator(".new-button").click();
  await page.locator(".task-dialog input").first().fill("E2E Task");
  await page.locator('.task-dialog button[type="submit"]').click();
  await expect(page.getByText("E2E Task", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("E2E Task", { exact: true })).toBeVisible();
  const response = await page.request.post("/api/rpc/task.list", { data: { userId: "admin" } });
  expect(response.ok()).toBeTruthy();
  const tasks = await response.json();
  expect(tasks).toHaveLength(1);
  expect(tasks[0].title).toBe("E2E Task");
});

test("creates and switches workspaces through the UI", async ({ page }) => {
  await page.goto("/");
  await page.locator(".user-button").click();
  await page.locator(".user-create input").fill("E2E Workspace");
  await page.locator('.user-create button[type="submit"]').click();
  await expect(page.locator(".user-button")).toContainText("E2E Workspace");
  const response = await page.request.post("/api/rpc/user.list", { data: {} });
  const users = await response.json();
  expect(users).toHaveLength(2);
});


test("new work uses a compact form with a visible create action", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await page.locator(".new-button").click();
  await expect(page.locator(".create-dialog")).toBeVisible();
  await expect(page.locator(".create-dialog .field")).toHaveCount(4);
  await expect(page.locator(".create-dialog .checklist-field")).toHaveCount(0);
  await expect(page.locator(".create-dialog .range-field")).toHaveCount(0);
  const createButton = page.locator('.create-dialog button[type="submit"]');
  await expect(createButton).toBeInViewport();
  const buttonBox = await createButton.boundingBox();
  expect(buttonBox).not.toBeNull();
  expect((buttonBox?.y ?? 0) + (buttonBox?.height ?? 0)).toBeLessThanOrEqual(640);
  await page.screenshot({ path: "test-results/create-dialog.png", fullPage: true, animations: "disabled" });
  await page.locator(".create-dialog input").first().fill("Compact create");
  await createButton.click();
  await expect(page.locator('.column-todo .project-folder[data-project="Personal work"]')).toContainText("Compact create");
  const response = await page.request.post("/api/rpc/task.list", { data: { userId: "admin" } });
  const tasks = await response.json();
  const created = tasks.find((task: { title: string }) => task.title === "Compact create");
  expect(created.priority).toBe("medium");
  expect(created.status).toBe("todo");
  expect(errors).toEqual([]);
});

test("moves and reorders work items with buttons and drag and drop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const create = async (id: string, title: string, status: string, position: number) => {
    const response = await page.request.post("/api/rpc/task.upsert", { data: { userId: "admin", task: {
      id, title, description: "", project: "Ordering", status, priority: "medium",
      startDate: "2026-11-25", dueDate: "2026-11-30", progress: status === "done" ? 100 : 0,
      position, parentId: null, sourceUrl: null, createdAt: position, deletedAt: null, logs: [], checklist: [],
    } } });
    expect(response.ok()).toBeTruthy();
  };
  await create("order-alpha", "Alpha", "todo", 100);
  await create("order-beta", "Beta", "todo", 200);
  await create("order-first", "First", "doing", 100);
  await create("order-second", "Second", "doing", 200);
  await page.goto("/");

  const moveResponse = () => page.waitForResponse((response) => response.url().endsWith("/api/rpc/task.move") && response.ok());
  await page.locator('.column-todo .project-folder[data-project="Ordering"]').click();
  await Promise.all([moveResponse(), page.getByRole("button", { name: "Move Alpha down", exact: true }).click()]);
  let response = await page.request.post("/api/rpc/task.list", { data: { userId: "admin" } });
  let tasks = await response.json();
  const orderedTodo = tasks.filter((task: { status: string }) => task.status === "todo").sort((a: { position: number }, b: { position: number }) => a.position - b.position).map((task: { id: string }) => task.id);
  expect(orderedTodo.indexOf("order-beta")).toBeLessThan(orderedTodo.indexOf("order-alpha"));

  await Promise.all([moveResponse(), page.getByRole("button", { name: "Move Alpha up", exact: true }).click()]);
  response = await page.request.post("/api/rpc/task.list", { data: { userId: "admin" } });
  tasks = await response.json();
  const restoredTodo = tasks.filter((task: { status: string }) => task.status === "todo").sort((a: { position: number }, b: { position: number }) => a.position - b.position).map((task: { id: string }) => task.id);
  expect(restoredTodo.indexOf("order-alpha")).toBeLessThan(restoredTodo.indexOf("order-beta"));

  const card = (title: string) => page.locator(".task-card").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  const pointerDrag = async (source: Locator, target: Locator, after = false) => {
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();
    if (!sourceBox || !targetBox) return;
    const start = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 };
    const end = { x: targetBox.x + Math.min(40, targetBox.width / 2), y: after ? targetBox.y + targetBox.height - 8 : targetBox.y + targetBox.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 12, start.y + 12, { steps: 4 });
    await page.mouse.move(end.x, end.y, { steps: 20 });
    await page.mouse.up();
    await expect(page.locator(".task-dialog")).toHaveCount(0);
  };
  await Promise.all([moveResponse(), pointerDrag(card("Alpha"), page.locator(".column-doing"), true)]);
  response = await page.request.post("/api/rpc/task.list", { data: { userId: "admin" } });
  tasks = await response.json();
  expect(tasks.find((task: { id: string }) => task.id === "order-alpha").status).toBe("doing");

  await Promise.all([moveResponse(), pointerDrag(card("First"), card("Second"), true)]);
  await page.reload();
  await expect(page.locator(".column-doing .task-card h3")).toHaveText(["Second", "First", "Alpha"]);
  response = await page.request.post("/api/rpc/task.list", { data: { userId: "admin" } });
  tasks = await response.json();
  const orderedDoing = tasks.filter((task: { status: string }) => task.status === "doing").sort((a: { position: number }, b: { position: number }) => a.position - b.position).map((task: { id: string }) => task.id);
  expect(orderedDoing).toEqual(["order-second", "order-first", "order-alpha"]);
  await page.screenshot({ path: "test-results/reordered-board.png", fullPage: true, animations: "disabled" });
  expect(errors).toEqual([]);
});


test("project input starts with personal work and persists new project names", async ({ page }) => {
  await page.goto("/");
  await page.locator(".user-button").click();
  await page.locator(".user-create input").fill("Project Pool");
  await page.locator('.user-create button[type="submit"]').click();
  await page.locator(".new-button").click();

  const projectInput = page.getByLabel("Project", { exact: true });
  const listId = await projectInput.getAttribute("list");
  expect(listId).toBeTruthy();
  const options = page.locator(`datalist[id="${listId}"] option`);
  await expect(options).toHaveCount(1);
  await expect(options.first()).toHaveAttribute("value", "Personal work");

  await projectInput.fill("Per");
  await expect(projectInput).toHaveValue("Per");
  await projectInput.fill("Research");
  await page.locator(".create-dialog input").first().fill("Project pool task");
  await page.locator('.create-dialog button[type="submit"]').click();
  await expect(page.locator('.column-todo .project-folder[data-project="Research"]')).toContainText("Project pool task");

  await page.reload();
  await page.locator(".new-button").click();
  const savedOptions = page.locator("datalist option");
  await expect(savedOptions).toHaveCount(2);
  await expect(savedOptions.nth(0)).toHaveAttribute("value", "Personal work");
  await expect(savedOptions.nth(1)).toHaveAttribute("value", "Research");
});


test("todo and done columns group work by project without grouping doing", async ({ page }) => {
  await page.goto("/");
  await page.locator(".user-button").click();
  await page.locator(".user-create input").fill("Project Groups");
  await page.locator('.user-create button[type="submit"]').click();
  await expect(page.locator(".user-button")).toContainText("Project Groups");
  const usersResponse = await page.request.post("/api/rpc/user.list", { data: {} });
  const users = await usersResponse.json();
  const userId = users.find((user: { name: string }) => user.name === "Project Groups").id;
  await expect.poll(() => page.evaluate(() => localStorage.getItem("kempt.currentUser"))).toBe(userId);
  const create = async (id: string, title: string, project: string, status: string, position: number) => {
    const response = await page.request.post("/api/rpc/task.upsert", { data: { userId, task: {
      id, title, description: "", project, status, priority: "medium", startDate: "2026-11-27",
      dueDate: "2026-12-01", progress: status === "done" ? 100 : 0, position, parentId: null,
      sourceUrl: null, createdAt: position, deletedAt: null, logs: [], checklist: [],
    } } });
    expect(response.ok()).toBeTruthy();
  };
  await create("group-a1", "Alpha one", "Alpha", "todo", 100);
  await create("group-b1", "Beta one", "Beta", "todo", 200);
  await create("group-a2", "Alpha two", "Alpha", "todo", 300);
  await create("group-b2", "Beta two", "Beta", "todo", 400);
  await create("group-done-a", "Done Alpha", "Alpha", "done", 100);
  await create("group-done-b", "Done Beta", "Beta", "done", 200);
  await create("group-doing-a", "Doing Alpha", "Alpha", "doing", 100);
  await page.reload();

  await expect(page.locator(".column-todo .project-folder .folder-copy b")).toHaveText(["Alpha", "Beta"]);
  await expect(page.locator(".column-done .project-folder .folder-copy b")).toHaveText(["Alpha", "Beta"]);
  await expect(page.locator(".column-todo .task-card")).toHaveCount(0);
  await expect(page.locator(".column-done .task-card")).toHaveCount(0);
  await expect(page.locator(".column-doing .column-project-group")).toHaveCount(0);
  await expect(page.locator(".column-doing .task-card h3")).toHaveText(["Doing Alpha"]);
  await page.screenshot({ path: "test-results/project-folders.png", fullPage: true, animations: "disabled" });

  await page.locator('.column-todo .project-folder[data-project="Alpha"]').click();
  await expect(page.locator('.column-todo .column-project-group[data-project="Alpha"] .task-card h3')).toHaveText(["Alpha one", "Alpha two"]);
  await page.locator('.column-todo .project-folder[data-project="Beta"]').click();
  await expect(page.locator('.column-todo .column-project-group[data-project="Beta"] .task-card h3')).toHaveText(["Beta one", "Beta two"]);
  await page.locator('.column-done .project-folder[data-project="Alpha"]').click();
  await expect(page.locator('.column-done .column-project-group[data-project="Alpha"] .task-card h3')).toHaveText(["Done Alpha"]);
  await expect(page.locator('.column-done .project-folder[data-project="Alpha"]')).toHaveAttribute("aria-expanded", "true");
});
