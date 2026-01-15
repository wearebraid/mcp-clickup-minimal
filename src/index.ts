#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API = "https://api.clickup.com/api/v2";
const TOKEN = process.env.CLICKUP_API_TOKEN;
const DEFAULT_TEAM = process.env.CLICKUP_TEAM_ID;

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

function json(data: object) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

const server = new McpServer({ name: "clickup", version: "1.0.0" });

// Get workspace hierarchy with members
server.tool("hierarchy", "Get spaces/folders/lists", { team: z.string().optional() }, async ({ team }) => {
  const t = team || DEFAULT_TEAM;
  if (!t) throw new Error("team required (or set CLICKUP_TEAM_ID)");
  const [teamInfo, spaces] = await Promise.all([
    api("GET", `/team/${t}`),
    api("GET", `/team/${t}/space?archived=false`),
  ]);
  const out = [];
  for (const sp of (spaces as { spaces: Array<{ id: string; name: string }> }).spaces || []) {
    const [folders, lists] = await Promise.all([
      api("GET", `/space/${sp.id}/folder?archived=false`),
      api("GET", `/space/${sp.id}/list?archived=false`),
    ]);
    out.push({
      id: sp.id,
      name: sp.name,
      folders: ((folders as { folders: Array<{ id: string; name: string; lists: Array<{ id: string; name: string }> }> }).folders || []).map((f) => ({
        id: f.id,
        name: f.name,
        lists: (f.lists || []).map((l) => ({ id: l.id, name: l.name })),
      })),
      lists: ((lists as { lists: Array<{ id: string; name: string }> }).lists || []).map((l) => ({ id: l.id, name: l.name })),
    });
  }
  const members = ((teamInfo as { team: { members: Array<{ user: { id: number; username: string; email: string } }> } }).team?.members || []).map((m) => ({
    id: m.user.id,
    name: m.user.username,
    email: m.user.email,
  }));
  return json({ spaces: out, members });
});

// Search tasks with filters
server.tool(
  "search",
  "Search tasks",
  {
    q: z.string(),
    team: z.string().optional(),
    assignee: z.number().optional().describe("Filter by user ID"),
    due_before: z.number().optional().describe("Tasks due before (Unix ms)"),
    due_after: z.number().optional().describe("Tasks due after (Unix ms)"),
  },
  async ({ q, team, assignee, due_before, due_after }) => {
    const t = team || DEFAULT_TEAM;
    if (!t) throw new Error("team required (or set CLICKUP_TEAM_ID)");
    const params = new URLSearchParams({ query: q });
    if (assignee) params.append("assignees[]", String(assignee));
    if (due_before) params.append("due_date_lt", String(due_before));
    if (due_after) params.append("due_date_gt", String(due_after));
    const res = await api("GET", `/team/${t}/task?${params}`);
    const tasks = ((res as { tasks: Array<{ id: string; name: string; status?: { status: string }; assignees?: Array<{ id: number; username: string }>; due_date?: string; url: string }> }).tasks || [])
      .slice(0, 20)
      .map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status?.status,
        assignees: t.assignees?.map((a) => ({ id: a.id, name: a.username })),
        due: t.due_date ? Number(t.due_date) : null,
        url: t.url,
      }));
    return json(tasks);
  }
);

// Get task details
server.tool("task", "Get task by ID", { id: z.string() }, async ({ id }) => {
  const t = (await api("GET", `/task/${id}`)) as {
    id: string;
    name: string;
    description: string;
    status?: { status: string };
    priority?: { priority: string };
    tags?: Array<{ name: string }>;
    assignees?: Array<{ id: number; username: string }>;
    due_date?: string;
    url: string;
  };
  return json({
    id: t.id,
    name: t.name,
    desc: t.description,
    status: t.status?.status,
    priority: t.priority?.priority,
    tags: t.tags?.map((x) => x.name),
    assignees: t.assignees?.map((a) => ({ id: a.id, name: a.username })),
    due: t.due_date ? Number(t.due_date) : null,
    url: t.url,
  });
});

// Create task
server.tool(
  "create",
  "Create task",
  {
    list: z.string(),
    name: z.string(),
    desc: z.string().optional(),
    priority: z.number().optional(),
    tags: z.array(z.string()).optional(),
    due: z.number().optional().describe("Due date (Unix ms)"),
    assignees: z.array(z.number()).optional().describe("User IDs to assign"),
  },
  async ({ list, name, desc, priority, tags, due, assignees }) => {
    const t = (await api("POST", `/list/${list}/task`, {
      name,
      description: desc,
      priority,
      tags,
      due_date: due,
      assignees,
    })) as { id: string; url: string };
    return json({ id: t.id, url: t.url });
  }
);

// Update task
server.tool(
  "update",
  "Update task",
  {
    id: z.string(),
    name: z.string().optional(),
    desc: z.string().optional(),
    status: z.string().optional(),
    priority: z.number().optional(),
    due: z.number().optional().describe("Due date (Unix ms), use 0 to clear"),
  },
  async ({ id, name, desc, status, priority, due }) => {
    const body: Record<string, unknown> = {};
    if (name !== undefined) body.name = name;
    if (desc !== undefined) body.description = desc;
    if (status !== undefined) body.status = status;
    if (priority !== undefined) body.priority = priority;
    if (due !== undefined) body.due_date = due || null;
    const t = (await api("PUT", `/task/${id}`, body)) as { id: string; url: string };
    return json({ id: t.id, url: t.url });
  }
);

// Delete task
server.tool("delete", "Delete task", { id: z.string() }, async ({ id }) => {
  await api("DELETE", `/task/${id}`);
  return json({ ok: true });
});

// Add assignee
server.tool(
  "assign",
  "Add assignee",
  { id: z.string(), user: z.number().describe("User ID") },
  async ({ id, user }) => {
    await api("POST", `/task/${id}/assignee`, { assignee: user });
    return json({ ok: true });
  }
);

// Remove assignee
server.tool(
  "unassign",
  "Remove assignee",
  { id: z.string(), user: z.number().describe("User ID") },
  async ({ id, user }) => {
    await api("DELETE", `/task/${id}/assignee`, { assignee: user });
    return json({ ok: true });
  }
);

// Add tag
server.tool("tag", "Add tag", { id: z.string(), tag: z.string() }, async ({ id, tag }) => {
  await api("POST", `/task/${id}/tag/${encodeURIComponent(tag)}`, {});
  return json({ ok: true });
});

// Remove tag
server.tool("untag", "Remove tag", { id: z.string(), tag: z.string() }, async ({ id, tag }) => {
  await api("DELETE", `/task/${id}/tag/${encodeURIComponent(tag)}`);
  return json({ ok: true });
});

await server.connect(new StdioServerTransport());
