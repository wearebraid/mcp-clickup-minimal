/**
 * Integration tests for @braid/mcp-clickup
 *
 * These tests run against the real ClickUp API.
 * Required env vars (loaded from .env):
 *   CLICKUP_API_TOKEN
 *   CLICKUP_TEAM_ID
 *   CLICKUP_TEST_LIST_ID
 *   CLICKUP_TEST_USER_ID
 */

import { readFileSync } from "fs";
import { config } from "dotenv";
import { describe, it, beforeAll, afterAll, expect } from "vitest";

config();

const API = "https://api.clickup.com/api/v2";
const TOKEN = process.env.CLICKUP_API_TOKEN;
const TEAM_ID = process.env.CLICKUP_TEAM_ID || "56136";
const TEST_LIST_ID = process.env.CLICKUP_TEST_LIST_ID || "901709737347";
const TEST_USER_ID = Number(process.env.CLICKUP_TEST_USER_ID || "95289221");

if (!TOKEN) {
  console.error("CLICKUP_API_TOKEN required");
  process.exit(1);
}

const headers = { Authorization: TOKEN, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: object) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.status === 204 ? {} : res.json();
}

// Track created tasks for cleanup
const createdTaskIds: string[] = [];

async function cleanup() {
  for (const id of createdTaskIds) {
    try {
      await api("DELETE", `/task/${id}`);
    } catch {
      // Ignore cleanup errors
    }
  }
}

describe("ClickUp MCP Integration Tests", () => {
  afterAll(cleanup);

  describe("hierarchy", () => {
    it("should return spaces and members", async () => {
      const [teamInfo, spaces] = await Promise.all([
        api("GET", `/team/${TEAM_ID}`),
        api("GET", `/team/${TEAM_ID}/space?archived=false`),
      ]);

      expect(Array.isArray(spaces.spaces)).toBe(true);
      expect(spaces.spaces.length).toBeGreaterThan(0);
      expect(Array.isArray(teamInfo.team.members)).toBe(true);
      expect(teamInfo.team.members.length).toBeGreaterThan(0);
    });
  });

  describe("task CRUD", () => {
    let taskId: string;
    const taskName = `Test Task ${Date.now()}`;

    it("should create a task", async () => {
      const res = await api("POST", `/list/${TEST_LIST_ID}/task`, {
        name: taskName,
        description: "Created by integration test",
      });

      expect(res.id).toBeDefined();
      expect(res.name).toBe(taskName);
      taskId = res.id;
      createdTaskIds.push(taskId);
    });

    it("should fetch the task", async () => {
      const task = await api("GET", `/task/${taskId}`);

      expect(task.id).toBe(taskId);
      expect(task.name).toBe(taskName);
      expect(task.description).toBe("Created by integration test");
    });

    it("should update the task", async () => {
      const newName = `Updated Task ${Date.now()}`;
      const res = await api("PUT", `/task/${taskId}`, {
        name: newName,
      });

      expect(res.name).toBe(newName);
    });

    it("should change task status", async () => {
      // Change to "in progress"
      const res = await api("PUT", `/task/${taskId}`, {
        status: "in progress",
      });

      expect(res.status?.status?.toLowerCase()).toBe("in progress");

      // Change back to open
      const res2 = await api("PUT", `/task/${taskId}`, {
        status: "Open",
      });

      expect(res2.status?.status?.toLowerCase()).toBe("open");
    });

    it("should update task due date", async () => {
      const dueDate = Date.now() + 86400000; // Tomorrow
      const res = await api("PUT", `/task/${taskId}`, {
        due_date: dueDate,
      });

      expect(res.due_date).toBeDefined();
    });

    it("should clear task due date", async () => {
      const res = await api("PUT", `/task/${taskId}`, {
        due_date: null,
      });

      expect(res.due_date).toBeNull();
    });

    it("should delete the task", async () => {
      await api("DELETE", `/task/${taskId}`);
      // Remove from cleanup list since we just deleted it
      const idx = createdTaskIds.indexOf(taskId);
      if (idx > -1) createdTaskIds.splice(idx, 1);

      // Verify deletion
      await expect(api("GET", `/task/${taskId}`)).rejects.toThrow("404");
    });
  });

  describe("search", () => {
    let taskId: string;

    beforeAll(async () => {
      const res = await api("POST", `/list/${TEST_LIST_ID}/task`, {
        name: `Search Test ${Date.now()}`,
      });
      taskId = res.id;
      createdTaskIds.push(taskId);
      // Wait for indexing
      await new Promise((r) => setTimeout(r, 1000));
    });

    it("should find tasks by query", async () => {
      const res = await api("GET", `/team/${TEAM_ID}/task?query=Search%20Test`);

      expect(Array.isArray(res.tasks)).toBe(true);
    });
  });

  describe("assignees", () => {
    let taskId: string;

    beforeAll(async () => {
      const res = await api("POST", `/list/${TEST_LIST_ID}/task`, {
        name: `Assignee Test ${Date.now()}`,
      });
      taskId = res.id;
      createdTaskIds.push(taskId);
    });

    it("should add an assignee", async () => {
      await api("PUT", `/task/${taskId}`, { assignees: { add: [TEST_USER_ID] } });

      const task = await api("GET", `/task/${taskId}`);
      const assigneeIds = task.assignees?.map((a: { id: number }) => a.id) || [];
      expect(assigneeIds).toContain(TEST_USER_ID);
    });

    it("should remove an assignee", async () => {
      await api("PUT", `/task/${taskId}`, { assignees: { rem: [TEST_USER_ID] } });

      const task = await api("GET", `/task/${taskId}`);
      const assigneeIds = task.assignees?.map((a: { id: number }) => a.id) || [];
      expect(assigneeIds).not.toContain(TEST_USER_ID);
    });
  });

  describe("tags", () => {
    let taskId: string;
    const testTag = "mcp-test-tag";

    beforeAll(async () => {
      const res = await api("POST", `/list/${TEST_LIST_ID}/task`, {
        name: `Tag Test ${Date.now()}`,
      });
      taskId = res.id;
      createdTaskIds.push(taskId);
    });

    it("should add a tag", async () => {
      await api("POST", `/task/${taskId}/tag/${encodeURIComponent(testTag)}`, {});

      const task = await api("GET", `/task/${taskId}`);
      const tagNames = task.tags?.map((t: { name: string }) => t.name) || [];
      expect(tagNames).toContain(testTag);
    });

    it("should remove a tag", async () => {
      await api("DELETE", `/task/${taskId}/tag/${encodeURIComponent(testTag)}`);

      const task = await api("GET", `/task/${taskId}`);
      const tagNames = task.tags?.map((t: { name: string }) => t.name) || [];
      expect(tagNames).not.toContain(testTag);
    });
  });

  describe("create with options", () => {
    it("should create task with assignees, due date, and tags", async () => {
      const dueDate = Date.now() + 86400000;
      const res = await api("POST", `/list/${TEST_LIST_ID}/task`, {
        name: `Full Options Test ${Date.now()}`,
        description: "Task with all options",
        assignees: [TEST_USER_ID],
        due_date: dueDate,
        tags: ["integration-test"],
      });

      createdTaskIds.push(res.id);

      const task = await api("GET", `/task/${res.id}`);
      expect(task.assignees?.some((a: { id: number }) => a.id === TEST_USER_ID)).toBe(true);
      expect(task.due_date).toBeDefined();
      expect(task.tags?.some((t: { name: string }) => t.name === "integration-test")).toBe(true);
    });
  });

  describe("attachments", () => {
    let taskId: string;

    beforeAll(async () => {
      const res = await api("POST", `/list/${TEST_LIST_ID}/task`, {
        name: `Attachment Test ${Date.now()}`,
      });
      taskId = res.id;
      createdTaskIds.push(taskId);
    });

    it("should attach test1.webp to task", async () => {
      const fileData = readFileSync("test1.webp");
      const base64 = fileData.toString("base64");

      const form = new FormData();
      form.append("attachment", new Blob([fileData]), "test1.webp");

      const res = await fetch(`${API}/task/${taskId}/attachment`, {
        method: "POST",
        headers: { Authorization: TOKEN! },
        body: form,
      });

      expect(res.ok).toBe(true);
      const result = await res.json();
      expect(result.id).toBeDefined();
      expect(result.url).toBeDefined();
    });

    it("should attach test2.webp to task", async () => {
      const fileData = readFileSync("test2.webp");

      const form = new FormData();
      form.append("attachment", new Blob([fileData]), "test2.webp");

      const res = await fetch(`${API}/task/${taskId}/attachment`, {
        method: "POST",
        headers: { Authorization: TOKEN! },
        body: form,
      });

      expect(res.ok).toBe(true);
      const result = await res.json();
      expect(result.id).toBeDefined();
    });

    it("should show attachments on task", async () => {
      const task = await api("GET", `/task/${taskId}`);
      expect(task.attachments?.length).toBe(2);
    });
  });
});
