"use client";

import { useRef, useState } from "react";
import { ERA_NAMES } from "@/lib/engine";

type Player = { id: string; name: string; friend: boolean; city: { name: string; era: number } | null };

export async function addFriend(target: { id: string } | { cityId: string }) {
  const res = await fetch("/api/friends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(target) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Chưa kết bạn được.");
  return data as { name: string };
}

export default function FriendSearch({ onChanged }: { onChanged: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const sequence = useRef(0);
  return <section className="friend-search" aria-label="Tìm bạn bè">
    <form onSubmit={async e => {
      e.preventDefault();
      const seq = ++sequence.current;
      setSearching(true); setNote(""); setPlayers(null);
      try {
        const res = await fetch(`/api/friends?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Không tìm được người chơi.");
        if (seq === sequence.current) setPlayers(data.players);
      } catch (err) { if (seq === sequence.current) setNote((err as Error).message); }
      finally { if (seq === sequence.current) setSearching(false); }
    }}>
      <label>Tìm bằng tên người chơi, tên nước hoặc mã mời
        <input value={query} maxLength={60} minLength={2} onChange={e => { setQuery(e.target.value); ++sequence.current; setSearching(false); setPlayers(null); setNote(""); }} placeholder="Nhập ít nhất 2 ký tự…" />
      </label>
      <button disabled={searching || query.trim().length < 2} type="submit">{searching ? "Đang tìm…" : "Tìm bạn"}</button>
    </form>
    {note && <p role="status" className="small">{note}</p>}
    {players && <>
      <p className="muted small">{players.length ? `${players.length} kết quả (tối đa 20). Kết bạn hai chiều ngay khi bấm; vị trí nước vẫn giữ kín.` : "Không tìm thấy người chơi. Thử tên khác hoặc mã mời."}</p>
      <ul>{players.map(p => <li key={p.id}>
        <div><b>{p.name}</b><span className="muted small">{p.city ? `${p.city.name} · ${ERA_NAMES[p.city.era]}` : "Chưa dựng làng"}</span></div>
        <button disabled={p.friend || adding !== null} onClick={async () => {
          setAdding(p.id); setNote("");
          try {
            await addFriend({ id: p.id });
            setPlayers(current => current?.map(item => item.id === p.id ? { ...item, friend: true } : item) ?? null);
            setNote(`Đã kết bạn với ${p.name}.`);
            await onChanged();
          } catch (err) { setNote((err as Error).message); }
          finally { setAdding(null); }
        }}>{p.friend ? "Đã là bạn" : adding === p.id ? "Đang kết bạn…" : "Kết bạn"}</button>
      </li>)}</ul>
    </>}
  </section>;
}
