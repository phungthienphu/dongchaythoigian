// Editable native-vector brand artwork; run with `node scripts/generate-brand.mjs`.
import fs from 'node:fs/promises';
import sharp from 'sharp';
const icon=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#173e34"/><path d="M7 44 32 31 57 44 32 58Z" fill="#75986b"/><path d="M12 47c23-14 37-3 19 8l-9-4c19-9 8-9-10-4Z" fill="#b8ded1"/><path d="m22 27 10-6 12 7v13l-12 6-10-6Z" fill="#e4c48b"/><path d="m32 34 12-6v13l-12 6Z" fill="#b98d57"/><path d="m17 28 14-16 18 16-17 8Z" fill="#e1b568"/><path d="m31 12 18 16-17 8Z" fill="#bb7f48"/><path d="M29 38h6v9l-3 1-3-2Z" fill="#456953"/></svg>`;
const house=(x,y,s,roof='#d3a369')=>`<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="20" rx="60" ry="17" fill="#143c323d"/><path d="M-38-20 0-41 40-20v42L0 43-38 22Z" fill="#e7cf9b"/><path d="m0 2 40-22v42L0 43Z" fill="#b59b6b"/><path d="m-51-21 40-53 61 30-50 29Z" fill="${roof}"/><path d="m-11-74 61 30-50 29Z" fill="#ad754c"/><path d="M-29 3-17 9v13l-12-6Z" fill="#658b77"/><path d="m12 10 12-7v30l-12 7Z" fill="#3d6351"/><path d="m29 1 7-4v10l-7 4Z" fill="#eadb9b"/></g>`;
const tree=(x,y,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})"><ellipse cy="9" rx="24" ry="8" fill="#12382e44"/><path d="M-3-24h6V8h-6Z" fill="#917553"/><ellipse cy="-33" rx="23" ry="28" fill="#497858"/><ellipse cx="-6" cy="-41" rx="17" ry="22" fill="#729666"/></g>`;
const scene=`<path d="M640 380 882 249 1162 390 923 541Z" fill="#b5c28b"/><path d="m640 380 283 161 239-151v26L923 568 640 406Z" fill="#527b59"/>
<path d="M733 332c215 33-30 95 117 168l55 30c-155-92 143-123-133-218Z" fill="#68b5ad"/><path d="M754 325c206 34-35 99 121 183" fill="none" stroke="#c0e2c5" stroke-width="5" opacity=".7"/>
${tree(1022,338,.95)}${tree(1071,362,.7)}${house(900,331,.95)}${house(1002,414,.73,'#aeb584')}${house(749,398,.63)}
<g transform="translate(890 447)"><path d="m-23-14 42-23 34 19-42 25Z" fill="#7f975e"/><path d="m-12-15 31-17m-20 23 31-17m-20 23 31-17" stroke="#d4c179" stroke-width="4"/></g>${tree(699,370,.8)}${tree(951,514,.8)}
<path d="m813 398 38-21 12 7-38 22Z" fill="#c8a576"/><path d="m816 393 35-19m-28 24 35-19" stroke="#e1c89c" stroke-width="2"/>
<g transform="translate(938 426)"><ellipse cy="9" rx="6" ry="3" fill="#244f3544"/><path d="m-2 1-2 8m5-8 3 8" stroke="#526a62" stroke-width="3"/><path d="M-4-11h8L5 2H-5Z" fill="#ca9969"/><circle cy="-15" r="4" fill="#e7bf91"/><path d="m-8-17 8-7 8 7Z" fill="#e6cc8b"/></g>`;
const og=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><radialGradient id="bg"><stop stop-color="#315b45"/><stop offset="1" stop-color="#132f29"/></radialGradient><pattern id="grid" width="80" height="46" patternUnits="userSpaceOnUse"><path d="M0 23 40 0 80 23 40 46Z" fill="none" stroke="#b6cba4" stroke-opacity=".035"/></pattern></defs><path fill="url(#bg)" d="M0 0h1200v630H0Z"/><path fill="url(#grid)" d="M0 0h1200v630H0Z"/><rect x="28" y="28" width="1144" height="574" rx="20" fill="none" stroke="#adc39c" stroke-opacity=".22"/>
<g transform="translate(69 64) scale(.8)">${icon.replace(/<svg[^>]*>|<\/svg>/g,'')}</g><text x="137" y="95" fill="#d3c290" font-family="DejaVu Sans" font-size="15" letter-spacing="3">DỰNG LÀNG · VIẾT NÊN LỊCH SỬ</text>
<text x="70" y="263" font-family="DejaVu Serif" font-weight="bold" font-size="76" fill="#f1e8cd">Dòng Sông</text><text x="70" y="355" font-family="DejaVu Serif" font-weight="bold" font-size="76" fill="#d9b978">Thời Đại</text><path d="M74 389h70" stroke="#d9b978" stroke-width="3"/>
<text x="73" y="435" fill="#b8cbb6" font-family="DejaVu Sans" font-size="22">Từ ngôi làng nhỏ ven sông,</text><text x="73" y="470" fill="#b8cbb6" font-family="DejaVu Sans" font-size="22">xây nên nền văn minh của bạn.</text>
${scene}<text x="73" y="558" fill="#92ad98" font-family="DejaVu Sans" font-size="13" letter-spacing="3">XÂY DỰNG · KHÁM PHÁ · PHÁT TRIỂN</text></svg>`;
await fs.writeFile('assets/brand/social-card.svg',og);await fs.writeFile('app/icon.svg',icon);
await sharp(Buffer.from(og)).png().toFile('app/opengraph-image.png');
await sharp(Buffer.from(icon)).resize(180,180).png().toFile('app/apple-icon.png');
// ICO directory with a PNG payload supported by modern browsers and Windows.
const images=await Promise.all([16,32,48].map(n=>sharp(Buffer.from(icon)).resize(n,n).png().toBuffer()));
const header=Buffer.alloc(6+16*images.length);header.writeUInt16LE(1,2);header.writeUInt16LE(images.length,4);let offset=header.length;
images.forEach((b,i)=>{const n=[16,32,48][i],at=6+i*16;header[at]=n;header[at+1]=n;header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(b.length,at+8);header.writeUInt32LE(offset,at+12);offset+=b.length;});
await fs.writeFile('app/favicon.ico',Buffer.concat([header,...images]));
