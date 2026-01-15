# @braid/mcp-clickup

A minimal MCP (Model Context Protocol) server for ClickUp integration.

## Installation

Add to your Claude Code, Cursor, or other MCP-compatible tool:

```json
{
  "mcpServers": {
    "clickup": {
      "command": "npx",
      "args": ["-y", "@braid/mcp-clickup@latest"],
      "env": {
        "CLICKUP_API_TOKEN": "pk_xxx",
        "CLICKUP_TEAM_ID": "your-team-id"
      }
    }
  }
}
```

Get your ClickUp API token from: **ClickUp Settings > Apps > API Token**

## Available Tools

| Tool | Description |
|------|-------------|
| `hierarchy` | Get spaces, folders, lists, and team members |
| `search` | Search tasks (with assignee/due date filters) |
| `task` | Get task details by ID |
| `create` | Create a task (with assignees, due date, tags) |
| `update` | Update task (name, desc, status, priority, due date) |
| `delete` | Delete a task |
| `assign` | Add assignee to task |
| `unassign` | Remove assignee from task |
| `tag` | Add tag to task |
| `untag` | Remove tag from task |

## Development

```bash
pnpm install
pnpm build
CLICKUP_API_TOKEN=pk_xxx pnpm start
```
