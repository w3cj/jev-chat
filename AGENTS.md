# AGENTS.md

pnpm monorepo: `apps/server` (Hono, Jev pipeline, MCP adapters), `apps/web` (React), and
`packages/mcp-*` (MCP servers written for this app, plus `mcp-kit`, their shared helpers).
README.md covers the architecture.

## Gates

Run after every change, in this order, before calling anything done:

```sh
pnpm format
pnpm lint:fix
pnpm test
pnpm typecheck
```

Fix whatever `lint:fix` leaves by hand; don't disable rules to get past it. Tests need no network
or API keys.

After each new feature passes the gates:

1. Run the [`code-simplifier`](.agents/skills/code-simplifier/SKILL.md) skill and fix what it
   finds.
2. If the feature touches the network or handles user input, run the
   [`security-review`](.agents/skills/security-review/SKILL.md) skill and fix what it finds.

Re-run the gates whenever either step changes code.

## Rules

- No model writes text. Jev only picks among options code supplies; every value in a reply comes
  from the user or a tool result. Never add free-text generation.
- Tool results are untrusted input. Keep policy checks in code.
- Adapter ids mirror upstream MCP tool names (`weather.get_weather`, `home.HassTurnOn`);
  multi-step adapters are named for what they do (`wiki.answer`).
- Args starting with `__` are private adapter hints for `confirm`, `present` or `run`; they are
  never sent to the MCP server or stored with the result.
- Test adapters with `tools/kit/testkit.ts`, which fakes Jev's picks.
- After changing `db/schema.ts`, run `pnpm --filter @jev-chat/server db:generate` and commit the
  SQL in `apps/server/drizzle/`.
- Shared tuning knobs (thresholds, locale, history sizes) live in `apps/server/src/config.ts`;
  limits only one module uses stay in that module.
- Never read or commit `.env`; add new settings to `.env.example`.
- Keep README.md in sync when layout, setup or the adapter contract changes.

## Files

Group by feature, not by kind. No `utils`/`helpers`/`misc` files. Tests sit beside their file as
`<file>.test.ts`. Split a folder into subfolders once it passes ~8 source files.

In `apps/server/src`, imports flow one way: `shared`, `lib`, `config.ts` → `jev`, `mcp` → `tools` →
`turn` → `app.ts`.

- `shared/`: only types and constants the web app imports.
- `jev/`: the Jev client and question/pool vocabulary. Pipeline logic goes in `turn/`.
- `tools/<ServerId>/`: one MCP server's adapters plus anything only it uses. Shared adapter code
  goes in `tools/kit/`. Tool folders never import each other; outside code imports `tools/index.ts`.
- New adapter: register it in `tools/index.ts`. New MCP server: also add it to `SERVERS`
  (`mcp/clients.ts`) and `ServerId` + `SERVER_LABELS` (`shared/servers.ts`).

## Comments

Default to no comment. Add one only when a competent reader would misread the code without it: a
dense regex, date/timezone math, or a quirk of a library or external API. Keep it to what the code
can't say, in one line where possible.

Every exported function gets a JSDoc comment saying what it does or returns, plus any contract the
signature doesn't show (e.g. "never throws", "undefined when…").

Don't write comments that:

- restate what the code does
- justify a decision, a product choice, or a lint/config setting
- compare against an alternative or a previous approach ("rather than X", "used to…")
- give maintenance guidance or cross-references ("to add one, also edit…")
- act as section dividers or file headers
