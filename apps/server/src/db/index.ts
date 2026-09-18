import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "./schema.ts";

const sqlite = new Database(process.env.DATABASE_PATH ?? "./jev-chat.db");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

migrate(db, {
  migrationsFolder: path.join(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle"),
});

export { schema };
