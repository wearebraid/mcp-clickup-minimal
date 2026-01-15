#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ClickUp API response types
interface Space {
  id: string;
  name: string;
}
interface Folder {
  id: string;
  name: string;
  lists: List[];
}
interface List {
  id: string;
  name: string;
}
interface Member {
  user: { id: number; username: string; email: string };
}
interface Task {
  id: string;
  name: string;
  description?: string;
  status?: { status: string };
  priority?: { priority: string };
  tags?: { name: string }[];
  assignees?: { id: number; username: string }[];
  due_date?: string;
  url: string;
}

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
  const teamId = team || DEFAULT_TEAM;
  if (!teamId) throw new Error("team required (or set CLICKUP_TEAM_ID)");

  const [teamInfo, spacesRes] = await Promise.all([
    api("GET", `/team/${teamId}`) as Promise<{ team: { members: Member[] } }>,
    api("GET", `/team/${teamId}/space?archived=false`) as Promise<{ spaces: Space[] }>,
  ]);

  const spaces = await Promise.all(
    (spacesRes.spaces || []).map(async (sp) => {
      const [foldersRes, listsRes] = await Promise.all([
        api("GET", `/space/${sp.id}/folder?archived=false`) as Promise<{ folders: Folder[] }>,
        api("GET", `/space/${sp.id}/list?archived=false`) as Promise<{ lists: List[] }>,
      ]);
      return {
        id: sp.id,
        name: sp.name,
        folders: (foldersRes.folders || []).map((f) => ({
          id: f.id,
          name: f.name,
          lists: (f.lists || []).map((l) => ({ id: l.id, name: l.name })),
        })),
        lists: (listsRes.lists || []).map((l) => ({ id: l.id, name: l.name })),
      };
    })
  );

  const members = (teamInfo.team?.members || []).map((m) => ({
    id: m.user.id,
    name: m.user.username,
    email: m.user.email,
  }));

  return json({ spaces, members });
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
    const teamId = team || DEFAULT_TEAM;
    if (!teamId) throw new Error("team required (or set CLICKUP_TEAM_ID)");

    const params = new URLSearchParams({ query: q });
    if (assignee) params.append("assignees[]", String(assignee));
    if (due_before) params.append("due_date_lt", String(due_before));
    if (due_after) params.append("due_date_gt", String(due_after));

    const res = (await api("GET", `/team/${teamId}/task?${params}`)) as { tasks: Task[] };
    const tasks = (res.tasks || []).slice(0, 20).map((task) => ({
      id: task.id,
      name: task.name,
      status: task.status?.status,
      assignees: task.assignees?.map((a) => ({ id: a.id, name: a.username })),
      due: task.due_date ? Number(task.due_date) : null,
      url: task.url,
    }));

    return json(tasks);
  }
);

// Get task details
server.tool("task", "Get task by ID", { id: z.string() }, async ({ id }) => {
  const task = (await api("GET", `/task/${id}`)) as Task;
  return json({
    id: task.id,
    name: task.name,
    desc: task.description,
    status: task.status?.status,
    priority: task.priority?.priority,
    tags: task.tags?.map((t) => t.name),
    assignees: task.assignees?.map((a) => ({ id: a.id, name: a.username })),
    due: task.due_date ? Number(task.due_date) : null,
    url: task.url,
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

// Add assignee (via update endpoint)
server.tool(
  "assign",
  "Add assignee",
  { id: z.string(), user: z.number().describe("User ID") },
  async ({ id, user }) => {
    await api("PUT", `/task/${id}`, { assignees: { add: [user] } });
    return json({ ok: true });
  }
);

// Remove assignee (via update endpoint)
server.tool(
  "unassign",
  "Remove assignee",
  { id: z.string(), user: z.number().describe("User ID") },
  async ({ id, user }) => {
    await api("PUT", `/task/${id}`, { assignees: { rem: [user] } });
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
