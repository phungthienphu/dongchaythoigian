// Deliberately separate from the battle Worker's platform declarations.
interface PrototypeCursor<T> extends Iterable<T> { toArray(): T[]; rowsRead: number; rowsWritten: number }
interface PrototypeSQL {
  exec<T = Record<string, unknown>>(query: string, ...bindings: (string | number | null)[]): PrototypeCursor<T>;
  databaseSize: number;
}
export interface PrototypeContext {
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
  storage: { sql: PrototypeSQL; transactionSync<T>(fn: () => T): T };
}
export interface PrototypeNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
