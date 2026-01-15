# mcp-clickup-minimal

A minimal MCP (Model Context Protocol) server for ClickUp integration.

## Requirements

- Node.js >= 18
- pnpm

## Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Copy the environment template and add your ClickUp API token:
   ```bash
   cp .env.example .env
   ```

3. Get your ClickUp API token from: **ClickUp Settings > Apps > API Token**

## Usage

### With Claude Code

Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "clickup": {
      "command": "node",
      "args": ["/path/to/mcp-clickup-minimal/index.js"],
      "env": {
        "CLICKUP_API_TOKEN": "pk_xxx",
        "CLICKUP_TEAM_ID": "your-team-id"
      }
    }
  }
}
```

### Standalone

```bash
CLICKUP_API_TOKEN=pk_xxx pnpm start
```

## Available Tools

| Tool | Description |
|------|-------------|
| `search` | Search tasks by query |
| `hierarchy` | Get spaces, folders, and lists |
| `task` | Get task details by ID |
| `create` | Create a new task |
| `update` | Update an existing task |
| `tag` | Add a tag to a task |
| `untag` | Remove a tag from a task |
