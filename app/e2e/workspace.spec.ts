import { test, expect } from "@playwright/test";

test("creates and reloads a persisted task", async ({ page }) => {
  await page.goto("/");
  await page.locator(".new-button").click();
  await page.locator(".task-dialog input").first().fill("E2E Task");
  await page.locator('.task-dialog button[type="submit"]').click();
  await expect(page.getByText("E2E Task", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("E2E Task", { exact: true })).toBeVisible();
  const response = await page.request.post("/api/rpc/task.list", { data: { userId: "shella" } });
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
