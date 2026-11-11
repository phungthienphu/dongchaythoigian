const ICON = {
  food: <svg viewBox="0 0 24 24"><path d="M3 12h18a9 9 0 0 1-18 0z" fill="#c98b4a" /><path d="M5 12c1-3 3.5-4.5 7-4.5S18 9 19 12z" fill="#f4ecd6" /></svg>,
  wood: <svg viewBox="0 0 24 24"><rect x="3" y="8" width="16" height="8" rx="4" fill="#8a5a2b" /><ellipse cx="19" cy="12" rx="2.6" ry="4" fill="#e0b27a" /></svg>,
  stone: <svg viewBox="0 0 24 24"><path d="M4 17l3-8 6-3 6 5 1 6z" fill="#b9b2a2" /><path d="M13 6l6 5 1 6h-7z" fill="#948d7e" /></svg>,
  copper: <svg viewBox="0 0 24 24"><path d="M3 16l4-6h10l4 6z" fill="#d9813a" /><path d="M7 10h10l-2-3H9z" fill="#f0a868" /></svg>,
  gold: <svg viewBox="0 0 24 24"><path d="M3 17l4-8h10l4 8z" fill="#f1c64f"/><path d="M7 9l3-3h7v3z" fill="#fff1a1"/></svg>,
  diamond: <svg viewBox="0 0 24 24"><path d="M3 9l5-5h8l5 5-9 12z" fill="#70dbe7"/><path d="M3 9h18M8 4l4 17 4-17" fill="none" stroke="#e6ffff"/></svg>,
  coal: <svg viewBox="0 0 24 24"><path d="M3 17l3-9 9-3 6 10-5 5H7z" fill="#455158"/><path d="M6 8l7 4 2-7" fill="#77888b"/></svg>,
  aetherCrystal: <svg viewBox="0 0 24 24"><path d="M12 2l6 8-6 12-6-12z" fill="#7fd0ff"/><path d="M12 2l2 8-2 12-2-12z" fill="#d9f3ff"/></svg>,
  rune: <svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="3" fill="#6a5a8e"/><path d="M12 6v12M8 9l8 6M16 9l-8 6" stroke="#e9d98a" strokeWidth="1.6" fill="none"/></svg>,
  essence: <svg viewBox="0 0 24 24"><path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" fill="#c76bd6"/><circle cx="10" cy="14" r="2" fill="#f3d4ff"/></svg>,
  pop: <svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="3.5" fill="#f1c9a0" /><path d="M5 21c0-5 3-8 7-8s7 3 7 8z" fill="#c9503e" /></svg>,
  build: <svg viewBox="0 0 24 24"><path d="M4 20l8-8" stroke="#8a5a2b" strokeWidth="2.5" strokeLinecap="round" /><rect x="10" y="4" width="10" height="6" rx="1" fill="#d6a03f" transform="rotate(45 15 7)" /></svg>,
  army: <svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" fill="#b04130" /><path d="M12 6l4 1.7V11c0 3-1.7 5-4 6.3z" fill="#e2b240" /></svg>,
  shop: <svg viewBox="0 0 24 24"><path d="M3 10h18l-2-5H5z" fill="#c94c38" /><path d="M5 10h14v9H5z" fill="#d9b98a" /><path d="M10 13h4v6h-4z" fill="#6b4526" /></svg>,
  era: <svg viewBox="0 0 24 24"><path d="M4 20h16l-3-6h-3l-2-4-2 4H7z" fill="#d6a03f" /><path d="M12 3v7" stroke="#f0c766" strokeWidth="2" /></svg>,
  log: <svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2" fill="#e8d8b0" /><path d="M8 8h8M8 12h8M8 16h5" stroke="#8a6a42" strokeWidth="1.6" /></svg>,
  world: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#2f6f8f" /><path d="M6 9c2-1 3 1 5 0s2-3 4-2 2 3 1 4-3 0-3 2 1 3-1 4-4-1-5-3-3-2-1-5z" fill="#7fae4c" /></svg>,
  friends: <svg viewBox="0 0 24 24"><circle cx="8.5" cy="8" r="3" fill="#f1c9a0" /><circle cx="15.5" cy="8" r="3" fill="#d9a77a" /><path d="M2.5 19c0-4 2.7-6 6-6s6 2 6 6z" fill="#3f6fb0" /><path d="M9.5 19c0-4 2.7-6 6-6s6 2 6 6z" fill="#5c9a8a" /></svg>,
  rank: <svg viewBox="0 0 24 24"><path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="#e2b240" /><path d="M10 14h4v3h3v3H7v-3h3z" fill="#b4842c" /></svg>,
};
export type IconKey = keyof typeof ICON;
export const Icon = ({ k }: { k: IconKey }) => <span className="ic" aria-hidden="true">{ICON[k]}</span>;
