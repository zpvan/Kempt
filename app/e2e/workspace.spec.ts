import { test, expect } from "@playwright/test";

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
  await expect(page.locator(".task-card h3").filter({ hasText: "Compact create" })).toBeVisible();
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
  await Promise.all([moveResponse(), card("Alpha").dragTo(page.locator(".column-doing .column-head"))]);
  response = await page.request.post("/api/rpc/task.list", { data: { userId: "admin" } });
  tasks = await response.json();
  expect(tasks.find((task: { id: string }) => task.id === "order-alpha").status).toBe("doing");

  const secondBox = await card("Second").boundingBox();
  expect(secondBox).not.toBeNull();
  await Promise.all([moveResponse(), card("First").dragTo(card("Second"), { targetPosition: { x: 40, y: (secondBox?.height ?? 100) - 8 } })]);
  await page.reload();
  await expect(page.locator(".column-doing .task-card h3")).toHaveText(["Second", "First", "Alpha"]);
  response = await page.request.post("/api/rpc/task.list", { data: { userId: "admin" } });
  tasks = await response.json();
  const orderedDoing = tasks.filter((task: { status: string }) => task.status === "doing").sort((a: { position: number }, b: { position: number }) => a.position - b.position).map((task: { id: string }) => task.id);
  expect(orderedDoing).toEqual(["order-second", "order-first", "order-alpha"]);
  await page.screenshot({ path: "test-results/reordered-board.png", fullPage: true, animations: "disabled" });
  expect(errors).toEqual([]);
});
