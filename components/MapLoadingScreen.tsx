"use client";
import { useEffect, useState } from 'react';
import type { RecoveryProgress } from '@/lib/city-recovery';

export default function MapLoadingScreen({ progress, error, reconnectAttempt = 0, onRetry }: {
  progress?: RecoveryProgress; error?: string; reconnectAttempt?: number; onRetry: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  const percent = progress ? Math.max(0, Math.min(100, progress.percent)) : undefined;
  const minutes = progress ? Math.floor(Math.max(0, progress.processed - progress.from) / 60_000) : 0;
  const totalMinutes = progress ? Math.ceil(Math.max(0, progress.target - progress.from) / 60_000) : 0;
  return <main className="map-loading">
    <section aria-labelledby="map-loading-title" aria-busy={!error}>
      <p className="map-loading-brand">DÒNG CHẢY THỜI GIAN</p>
      <svg aria-hidden="true" viewBox="0 0 80 40" width="80" height="40" fill="none"><path d="M4 10c22-18 50 18 72 0M4 22c22-18 50 18 72 0M4 34c22-18 50 18 72 0" stroke="currentColor" strokeWidth="2"/></svg>
      <h1 id="map-loading-title">{error ? 'Chưa tải được làng' : progress ? 'Làng đang bắt kịp thời gian' : 'Đang mở làng của bạn'}</h1>
      <p role={error ? 'alert' : 'status'}>{error ?? (reconnectAttempt ? `Kết nối tạm gián đoạn. Đang tự kết nối lại (lần ${reconnectAttempt}/5)…` : progress ? 'Đang tính bù tiến trình trong lúc bạn vắng mặt…' : 'Đang mở lại làng của bạn…')}</p>
      {!error && <progress max={100} value={percent} aria-label={progress ? 'Tiến trình khôi phục làng' : 'Đang kết nối với làng'}/>}
      {percent !== undefined && <><p className="small muted">{percent}% · Đã tính {minutes.toLocaleString('vi-VN')} / {totalMinutes.toLocaleString('vi-VN')} phút vắng mặt.</p><p className="small muted">Phần đã xử lý được lưu lại sau mỗi lượt.</p></>}
      {!error && <p className="small muted">Đã chờ {elapsed < 60 ? `${elapsed} giây` : `${Math.floor(elapsed / 60)} phút ${elapsed % 60} giây`}</p>}
      {error ? <button className="primary" onClick={onRetry}>Thử tải lại</button> : <p className="small muted">{progress ? 'Máy chủ đang cập nhật sản xuất, vận chuyển và các sự kiện khi bạn vắng mặt. Làng đông dân hoặc vắng lâu sẽ cần nhiều lượt xử lý.' : elapsed >= 15 ? 'Kết nối đang lâu hơn thường lệ. Chúng tôi vẫn đang thử mở làng; lỗi kết nối sẽ hiện tại đây.' : 'Đang kết nối máy chủ và lấy dữ liệu làng.'} {elapsed >= 15 && 'Bạn không cần tải lại trang để tiếp tục.'}</p>}
    </section>
  </main>;
}
