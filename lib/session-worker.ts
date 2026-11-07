/** Session fences live on Cloudflare so combat checks never call Vercel per command. */
export async function updateWorkerSession(playerId: string, version: number) {
  const origin = process.env.BATTLE_WORKER_URL;
  const secret = process.env.BATTLE_SERVER_SECRET;
  if (!origin || !secret || secret.length < 32) return;
  const url = new URL(origin);
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('BATTLE_WORKER_URL cần dùng HTTPS.');
  const response = await fetch(`${url.origin}/rooms/player-${encodeURIComponent(playerId)}/session`, {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(12_000),
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify({ version }),
  });
  if (!response.ok) throw new Error('Không xác nhận được phiên chơi trên máy chủ trận đánh. Hãy đăng nhập lại.');
}
