"use client";
import { useState } from 'react';
import DiplomacyMessages from '@/components/DiplomacyMessages';
import type { DiplomaticMessage } from '@/lib/diplomacy-types';
export default function DiplomacyPreview() {
    const [side, setSide] = useState<'host' | 'visitor'>('host');
    const [message, setMessage] = useState<DiplomaticMessage>({ id: 'demo', side: 'host', name: 'Bến Phù Sa', arrive: 0 });
    return <main className="wrap" style={{ maxWidth: 680, padding: 24 }}><h1>Thử lời nhắn ngoại giao</h1><p>Bản thử độc lập, không dùng tài khoản hoặc thay đổi vị trí nước thật.</p><p>Góc nhìn: {side === 'host' ? 'Nước được sứ giả tới thăm' : 'Nước cử sứ giả'}</p><div className="actions"><button onClick={() => setSide(side === 'host' ? 'visitor' : 'host')}>Đổi góc nhìn</button><button onClick={() => { setMessage({ id: 'demo', side: 'host', name: 'Bến Phù Sa', arrive: 0 }); setSide('host'); }}>Làm lại</button></div>
        <DiplomacyMessages messages={side === 'visitor' && !message.requestedAt ? [] : [{ ...message, side, name: side === 'host' ? 'Bến Phù Sa' : 'Làng Bên Sông' }]} busy={false} error="" onAction={(_id, action) => setMessage(m => ({ ...m, ...(action === 'request' ? { requestedAt: Date.now() } : { decision: action === 'accept' ? 'accepted' : 'declined', decidedAt: Date.now() }) }))} /></main>;
}
