# CLAUDE.md

This is a minimal MCP server for ClickUp. Keep it minimal.

## Development Process

**This project enforces Test-Driven Development (TDD).**

When adding or modifying functionality:

1. **Write the test first** - Add a failing test to `test/integration.test.ts`
2. **Run tests to confirm failure** - `pnpm test` should fail
3. **Implement the feature** - Update `src/index.ts`
4. **Run tests to confirm success** - `pnpm test` should pass
5. **Refactor if needed** - Clean up while keeping tests green

## Commands

```bash
pnpm build      # Compile TypeScript
pnpm test       # Run integration tests (requires .env)
pnpm start      # Run the MCP server
pnpm release    # Bump version, tag, and push
```

## Environment

Copy `.env.example` to `.env` and fill in your ClickUp credentials:

- `CLICKUP_API_TOKEN` - Required for all operations
- `CLICKUP_TEAM_ID` - Default team for tools
- `CLICKUP_TEST_LIST_ID` - List used by integration tests
- `CLICKUP_TEST_USER_ID` - User ID for assignee tests

## Architecture

- `src/index.ts` - Single-file MCP server with all 10 tools
- `test/integration.test.ts` - Integration tests against real ClickUp API
- Tests must pass before committing (enforced by pre-commit hook)

## Tools

| Tool | Description |
|------|-------------|
| hierarchy | Get spaces/folders/lists + team members |
| search | Find tasks with filters (assignee, due date) |
| task | Get task details |
| create | Create task with assignees, due date, tags |
| update | Update task properties including status |
| delete | Delete task |
| assign | Add assignee to task |
| unassign | Remove assignee from task |
| tag | Add tag to task |
| untag | Remove tag from task |
| attach | Attach file (base64) to task |
