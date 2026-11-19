export type AdminTab =
  "overview" | "players" | "cities" | "battles" | "market" | "audit";
export type AdminRow = Record<string, string | number | null>;
export type AdminData = {
  actor: string;
  tab: AdminTab;
  at: string;
  page: number;
  hasMore: boolean;
  rows: AdminRow[];
  metrics?: { label: string; value: number }[];
};
export type AdminCommand = {
  action: "rename-city" | "note";
  target: string;
  reason: string;
  value: string;
  expected?: string;
  requestId: string;
};
