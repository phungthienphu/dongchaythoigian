'use client';
// Isolated browser fixture: no account, economy or API writes.
import { useEffect, useRef, useState } from 'react';
import MapLoadingScreen from '@/components/MapLoadingScreen';
import { loadCityResponse } from '@/lib/city-loading';
import type { RecoveryProgress } from '@/lib/city-recovery';

export default function RecoveryPreview() {
  const [progress, setProgress] = useState<RecoveryProgress>();
  const [attempt, setAttempt] = useState(0), [done, setDone] = useState(false);
  const [error, setError] = useState<string>();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const run = async () => {
    controller.current?.abort(); const current = new AbortController(); controller.current = current;
    setProgress(undefined); setAttempt(0); setDone(false); setError(undefined);
    let calls = 0;
    try {
      await loadCityResponse({ signal: current.signal,
        onRetry: setAttempt, onProgress: p => { if (p) setProgress(p); },
        fetcher: async () => {
          calls++;
          if (calls === 2) throw new TypeError('simulated disconnect');
          if (calls === 3) return Response.json({}, { status: 503 });
          if (calls === 5) return Response.json({ recovering: true }, { status: 202 });
          if (calls >= 6) return Response.json({ state: { synthetic: true } });
          return Response.json({ recovering: true, progress: { from: 0, target: 100, processed: calls === 1 ? 25 : 75, percent: calls === 1 ? 25 : 75 }, retryAfterMs: 1000 }, { status: 202 });
        },
      });
      setDone(true); setAttempt(0);
    } catch { if (!current.signal.aborted) setError('Chưa tải được làng.'); }
  };
  return <>
    <div style={{ position: 'fixed', top: 12, left: 12, zIndex: 10 }}>
      <button onClick={() => void run()}>Thử tải làng bị ngắt kết nối</button>
      <p>Bản thử độc lập · không gọi API hay thay đổi tài khoản.</p>
    </div>
    {done ? <main className="map-loading"><p role="status">Tải làng thành công · đã tự nối lại và giữ tiến trình.</p></main>
      : <MapLoadingScreen progress={progress} error={error} reconnectAttempt={attempt} onRetry={() => void run()} />}
  </>;
}
