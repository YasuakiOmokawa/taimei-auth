import { sql } from "drizzle-orm";
import { db } from "../client";

export async function pingDatabase(): Promise<boolean> {
  return db
    .execute(sql`SELECT 1`)
    .then(() => true)
    .catch(() => false);
}
