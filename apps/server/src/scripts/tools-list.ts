/* oxlint-disable no-console */
import { closeAll, connectAll } from "../mcp/clients.ts";

const verbose = process.argv.includes("--schema");
for (const s of await connectAll()) {
  console.log(
    `\n== ${s.label} (${s.id}): ${s.status}${s.missingEnv ? ` — missing ${s.missingEnv.join(", ")}` : ""}${s.error ? ` — ${s.error}` : ""}`,
  );
  for (const t of s.tools) {
    console.log(
      `  • ${t.name}${t.annotations?.readOnlyHint ? " [read-only]" : ""}: ${(t.description ?? "").split("\n")[0]}`,
    );
    if (verbose) console.log(JSON.stringify(t.inputSchema, null, 2).replace(/^/gm, "      "));
  }
}
await closeAll();
process.exit(0);
