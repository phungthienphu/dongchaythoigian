"use client";
import type { RecoveryProgress } from '@/lib/city-recovery';

export default function MapLoadingScreen({ progress, error, reconnectAttempt = 0, onRetry }: {
  progress?: RecoveryProgress; error?: string; reconnectAttempt?: number; onRetry: () => void;
}) {
  const percent = progress ? Math.max(0, Math.min(100, progress.percent)) : undefined;
  return <main className="map-loading">
    <section aria-labelledby="map-loading-title" aria-busy={!error}>
      <p className="map-loading-brand">DÒNG CHẢY THỜI GIAN</p>
      <svg aria-hidden="true" viewBox="0 0 80 40" width="80" height="40" fill="none"><path d="M4 10c22-18 50 18 72 0M4 22c22-18 50 18 72 0M4 34c22-18 50 18 72 0" stroke="currentColor" strokeWidth="2"/></svg>
      <h1 id="map-loading-title">{error ? 'Chưa tải được làng' : 'Đang tải bản đồ'}</h1>
      <p role={error ? 'alert' : 'status'}>{error ?? (reconnectAttempt ? `Kết nối tạm gián đoạn. Đang tự kết nối lại (lần ${reconnectAttempt}/5)…` : progress ? 'Đang tính bù tiến trình trong lúc bạn vắng mặt…' : 'Đang mở lại làng của bạn…')}</p>
      {percent !== undefined && <><progress max={100} value={percent} aria-label="Tiến trình khôi phục làng"/><p className="small muted">{percent}% · Tiến trình đã xử lý được lưu lại.</p></>}
      {error ? <button className="primary" onClick={onRetry}>Thử tải lại</button> : <p className="small muted">Lần trở lại sau nhiều ngày có thể cần thêm chút thời gian.</p>}
    </section>
  </main>;
}
