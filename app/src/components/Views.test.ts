import { describe, expect, it } from "vitest";
import { emptyTask, type Task } from "@/lib/tasks";
import { reorderIds } from "./Views";

const task = (id: string, position: number): Task => ({
  ...emptyTask(),
  id,
  title: id,
  createdAt: position,
  position,
});

describe("reorderIds", () => {
  const list = [task("a", 100), task("b", 200), task("c", 300)];

  it("moves an item before and after a target in the same status", () => {
    expect(reorderIds(list, "a", "c", "before")).toEqual(["b", "a", "c"]);
    expect(reorderIds(list, "a", "b", "after")).toEqual(["b", "a", "c"]);
    expect(reorderIds(list, "b", "c", "after")).toEqual(["a", "c", "b"]);
  });

  it("moves an item to the end and keeps a self-drop unchanged", () => {
    expect(reorderIds(list, "a")).toEqual(["b", "c", "a"]);
    expect(reorderIds(list, "b", "b", "after")).toEqual(["a", "b", "c"]);
  });

  it("inserts an item from another status at the requested destination", () => {
    expect(reorderIds(list, "new", "b", "before")).toEqual(["a", "new", "b", "c"]);
    expect(reorderIds(list, "new", "b", "after")).toEqual(["a", "b", "new", "c"]);
  });
});
