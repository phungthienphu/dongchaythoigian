// Minimal platform surface used here; Wrangler supplies these at runtime.
interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
interface DurableObjectState {
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
  waitUntil(promise: Promise<unknown>): void;
  getWebSockets(): WebSocket[];
  acceptWebSocket(socket: WebSocket): void;
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
    put(values: Record<string, unknown>): Promise<void>;
    delete(key: string): Promise<boolean>;
    setAlarm(time: number): Promise<void>;
    deleteAlarm(): Promise<void>;
  };
}
interface WebSocket {
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}
declare const WebSocketPair: { new(): { 0: WebSocket; 1: WebSocket } };
