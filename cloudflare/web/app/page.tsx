import GamePage from '../../../app/page';

// Rendered at static build time; never included in the production-origin build.
export default function Page() {
  const qa = process.env.WEB_ORIGIN === 'https://dong-song-game-staging.phungthienphu.workers.dev';
  return <>
    {qa && <>
      <style>{`.qa-notice{position:fixed;inset:0 0 auto;z-index:1000;min-height:52px;padding:7px 16px;background:#372e1b;color:#f3dbab;font:12px/18px system-ui;border-bottom:1px solid #80653a}.qa-notice strong{display:block}body:has(.game) .game{top:52px}body:not(:has(.game)){padding-top:68px}@media(max-width:540px){.qa-notice{min-height:70px}body:has(.game) .game{top:70px}body:not(:has(.game)){padding-top:86px}}`}</style>
      <aside className="qa-notice" role="note"><strong>Bản thử QA · dữ liệu riêng</strong>Làng thật chưa được chuyển. Chợ, sứ giả và trận đánh chưa mở trên bản thử này.</aside>
    </>}
    <GamePage />
  </>;
}
