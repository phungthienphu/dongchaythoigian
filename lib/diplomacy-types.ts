export type EnvoyVisit = {
  _id: string;
  from: string;
  to: string;
  fromName: string;
  toName: string;
  arrive: number;
  eventAt?: number;
  expiresAt: Date;
  requestedAt?: number;
  decidedAt?: number;
  decision?: 'accepted' | 'declined';
};
/** Public messages intentionally contain neither world coordinates nor travel routes. */
export type DiplomaticMessage = {
  known?: boolean;
  id: string; side: 'host' | 'visitor'; name: string; arrive: number;
  requestedAt?: number; decidedAt?: number; decision?: 'accepted' | 'declined';
};
export type DiplomacyInbox = { messages: DiplomaticMessage[]; nextArrival?: number; serverNow: number };
