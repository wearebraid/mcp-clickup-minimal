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

const h = { Authorization: TOKEN, "Content-Type": "application/json" };

async function api(m, p, b) {
  const r = await fetch(`${API}${p}`, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json();
}

const server = new McpServer({ name: "clickup-minimal", version: "1.0.0" });

server.tool("search", "Search tasks", { q: z.string(), team: z.string().optional() }, async ({ q, team }) => {
  const t = team || DEFAULT_TEAM;
  if (!t) throw new Error("team required (or set CLICKUP_TEAM_ID)");
  const r = await api("GET", `/team/${t}/task?query=${encodeURIComponent(q)}`);
  const tasks = (r.tasks || []).slice(0, 10).map(t => ({ id: t.id, name: t.name, status: t.status?.status, url: t.url }));
  return { content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }] };
});

server.tool("hierarchy", "Get spaces/folders/lists", { team: z.string().optional() }, async ({ team }) => {
  const t = team || DEFAULT_TEAM;
  if (!t) throw new Error("team required (or set CLICKUP_TEAM_ID)");
  const s = await api("GET", `/team/${t}/space?archived=false`);
  const out = [];
  for (const sp of s.spaces || []) {
    const f = await api("GET", `/space/${sp.id}/folder?archived=false`);
    const l = await api("GET", `/space/${sp.id}/list?archived=false`);
    out.push({ id: sp.id, name: sp.name, folders: (f.folders || []).map(x => ({ id: x.id, name: x.name, lists: (x.lists || []).map(y => ({ id: y.id, name: y.name })) })), lists: (l.lists || []).map(x => ({ id: x.id, name: x.name })) });
  }
  return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
});

server.tool("task", "Get task by ID", { id: z.string() }, async ({ id }) => {
  const t = await api("GET", `/task/${id}`);
  const task = { id: t.id, name: t.name, desc: t.description, status: t.status?.status, priority: t.priority?.priority, tags: t.tags?.map(x => x.name), url: t.url };
  return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
});

server.tool("create", "Create task", { list: z.string(), name: z.string(), desc: z.string().optional(), priority: z.number().optional(), tags: z.array(z.string()).optional() }, async ({ list, name, desc, priority, tags }) => {
  const t = await api("POST", `/list/${list}/task`, { name, description: desc, priority, tags });
  return { content: [{ type: "text", text: JSON.stringify({ id: t.id, url: t.url }, null, 2) }] };
});

server.tool("update", "Update task", { id: z.string(), name: z.string().optional(), desc: z.string().optional(), status: z.string().optional(), priority: z.number().optional() }, async ({ id, name, desc, status, priority }) => {
  const t = await api("PUT", `/task/${id}`, { name, description: desc, status, priority });
  return { content: [{ type: "text", text: JSON.stringify({ id: t.id, url: t.url }, null, 2) }] };
});

server.tool("tag", "Add tag", { id: z.string(), tag: z.string() }, async ({ id, tag }) => {
  await api("POST", `/task/${id}/tag/${encodeURIComponent(tag)}`, {});
  return { content: [{ type: "text", text: JSON.stringify({ ok: true }) }] };
});

server.tool("untag", "Remove tag", { id: z.string(), tag: z.string() }, async ({ id, tag }) => {
  await api("DELETE", `/task/${id}/tag/${encodeURIComponent(tag)}`);
  return { content: [{ type: "text", text: JSON.stringify({ ok: true }) }] };
});

await server.connect(new StdioServerTransport());
