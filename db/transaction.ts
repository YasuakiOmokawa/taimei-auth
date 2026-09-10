import { db } from "./client";

export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbOrTx = typeof db | DbTx;

export function runInTransaction<T>(fn: (tx: DbTx) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}
