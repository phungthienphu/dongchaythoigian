# Zombie tản quanh ổ nứt và đi lệch nhịp

Release ID: `zombie-spread-20261111`.

Nguyên nhân bầy cũ co cụm: cả đợt xuất hiện tại một ô, cùng loại có cùng tốc độ, cùng thứ tự chọn đường ngắn nhất và cập nhật đường mỗi hai giây. Hoạt ảnh cũng dùng chung pha và luôn quay một hướng.

Điều chỉnh:

- Trồi ở các ô đất trống nối được quanh điểm cảnh báo, tối đa hai bước theo cạnh. Con đầu vẫn ở điểm báo; lần lượt dùng các ô còn lại trước khi dùng lại. Không sinh xuyên tường, sông, sương, công trình hoặc dân/quân đang đứng. Ổ bị bao kín vẫn phải phá vây, không tự xuất hiện ngoài vòng tường.
- Giữa các con lệch 1,4–2,6 giây; mỗi con có hệ số tốc độ cố định 0,92–1,08 theo seed và ID.
- A* thêm ưu tiên đường ít đông và sở thích đường riêng từng con. Tất cả vẫn đi trên địa hình hợp lệ, qua cầu nếu cần. Giữ giới hạn bốn con cùng cận chiến một mục tiêu và giới hạn mật độ ô hiện có; phân tán bớt mục tiêu nhà/lính khi có lựa chọn gần nhau.
- Lệch thời gian tính lại đường, tránh kéo ngược về tâm ô đang đứng mỗi lần đổi đường. Hoạt ảnh lệch pha và quay theo hướng tiến/đánh.
- Không đổi tổng số lượng đợt, thành phần, máu hoặc sát thương. Đây là thay đổi hành vi nên áp lực thực tế có thể khác do tiếp cận từ nhiều hướng hơn. Cửa hẹp vẫn khiến bầy tụ lại theo địa hình.
- Không dùng random theo frame/wall clock. Các trường hướng là tùy chọn nên save cũ đọc được; không reset lịch zombie, quân hay làng.

Kiểm tra: 562 test game, 9 test API, 18 test Worker, TypeScript, render regression và build Cloudflare đạt. Test mới gồm sinh rải có vật cản/người/sương, ổ bao kín, đa dạng đường/né đông/qua cầu, lưu-tải lại và online/offline khớp. Browser local `/dev/zombies` có tùy chọn xem bầy 17 zombie không phòng thủ, nút tiến từng giây và chế độ phòng thủ 9 zombie cũ.

## Phát hành 11/11/2026

- Commit tính năng: `5ef36d5`, đã push main.
- Web/API: `de52696f-7f9d-4617-a516-c4b397c78feb`.
- Combat Worker: `bba921f9-8cb8-45bf-a7c6-d32c6e7177e5`.
- Production smoke: 30 request, 19 assets đạt; API xác thực giữ làng Nam Quốc Sơn Hà. Combat/chợ reconcile: `ok: true`, `failed: 0`.
- Log: `/tmp/zombie-spread-{web-deploy,battle-deploy,production-smoke,reconcile}.log`.

Phạm vi điều quân hiện có: di chuyển đơn/nhóm, đặt chốt và tự chọn zombie trong tầm. Chưa có lệnh chọn một zombie làm mục tiêu tập trung. Lỗi tái đánh số lính sau khi đồng đội chết làm thay vị trí gác đã được tái hiện, chưa sửa trong bản này. Kiểm tra API production không thay cho nghiệm thu điều quân tương tác trên tài khoản thật.

## Zombie locator and committed pursuit

Released together with catch-up routing optimization in `c9ec755`: Web/API release `catchup-zombie-c9ec755`, Cloudflare version `30417b97-a65d-4059-a553-87c0a0e450c4`. Combat Worker unchanged. Public health and eight homepage asset hashes verified; no private-account smoke performed for this release.

- The village threat banner locates the next emerged, living zombie. A red ring and label identify the selected actor; the map toolbar can recenter or cycle targets. The zombie panel lists coordinates and individual location buttons. Pending actors are counted separately and have a pending marker when selected.
- Dead and expired actors are excluded. Once the selected actor disappears, recenter is disabled and the player can select the next actor.
- Distant actors now approach the closest village structure rather than idling outside the local detection radius. Valid targets are held for at least five seconds unless a nearby soldier intercepts; civilian contact and guard pursuit limits still apply.
- Routes remain stable until the target moves to a different tile or the next step is blocked. Replanning preserves the unfinished edge to avoid walking back toward a cell center. Failed routes retry with a two-second cooldown. Close pursuit accounts for the victim's fractional position to reach melee range.
- Drawing interpolates the previous simulated second without predicting future movement. Wilderness renewal protects live zombie positions and paths.
- The local `/dev/magic-ui` harness includes “Thử định vị zombie”: two emerged actors and one pending actor, without production account data. Desktop and 390px mobile checks covered banner location, target cycling, red marker and disabled recenter after death.
- Economic resource/crafting test fixtures postpone zombie waves beyond their simulated window, so the new long-range attacks do not destroy unrelated production fixtures.

## Unreachable-target recovery (released 48f4be0)

When bounded A* fails, zombie pursuit now searches connected walkable ground for
an attackable structure. The first reachable building or blocking wall/gate
becomes the new target, with a route constructed by that same search. This
fallback is bounded by the 96×96 map and does not chain A* once per building.
A reachable building target is retained while its route is active, preventing
immediate switches back to the closer but unreachable original target.

Water, rocks and magical barriers retain their movement rules. An isolated
actor stays on its bank and retries after the existing two-second cooldown;
opening a crossing allows pursuit to resume. Regression tests cover a closer
building across a river with an accessible alternative, enclosed buildings,
reopening a crossing, and save/reload equivalence. No production data is edited.

## Modern-era pressure rebalance (released 48f4be0)

From era 6, population-scaled wave size is multiplied by 2 / 2.25 / 2.5 /
2.75 for eras 6–9, rounded up, with a minimum of eight actors. For 680 people:
17 before, versus 34 / 39 / 43 / 47 respectively. Variant shares still come out
of that total. Era 1–5 wave sizes and stats are unchanged.

New modern actors emerge every 250–650 ms instead of 1,400–2,600 ms. Warning
lead time, the five-minute first-wave grace, fifteen-minute minimum interval,
and existing scheduled timestamps remain unchanged.

Era 6 HP is 240 normal / 720 Super / 1,100 breaker, increasing by 60 / 120 /
180 per later era through era 9. A 200-damage armor shell therefore needs at
least 2 / 4 / 6 hits respectively at era 6. Speeds are .6 / 1.05 / .4 tiles/s.
Guard damage starts at 12 / 18 / 24 per hit and increases 2 / 3 / 4 per later
era; breaker building damage remains doubled. Civilian bite damage is unchanged.
Existing actors keep saved HP; new HP/count/emergence timing apply on future
spawns. Combat stats are read by the engine for existing actors on their next
tick. No retroactive waves or production save edits are applied.

These are simulation baselines, not a claim of completed live balance testing.
Regression checks cover shell survivability, variant roles, wave totals, dense
emergence, unreachable-target recovery, and deterministic save/reload replay.

Validation: 580 game tests passed in the shared workspace, including 29 focused
zombie tests; TypeScript and render checks passed. Actual armor combat verifies
240 HP survives the first 200-damage shell and dies on the second. This also
covers a fixed idle shortcut: guards waiting on attack cooldown must keep
combat ticking rather than sleeping through the next scheduled shot. Magic
integration fixtures now stage armor support so scripted research/mana-outage
checks retain their intended protected production infrastructure under the
stronger modern waves.

## Production release

Đã phát hành Web/API Cloudflare từ commit `48f4be0`, release `crowd-zombie-48f4be0`, version `c60e9738-0730-4302-9c90-a0df94311707`. Build production đạt; TypeScript, 581 full game tests (trước test neo nhãn cuối), 7 crowd tests, 6 API tests và 18 Worker tests đạt. Combat Worker không deploy lại; không migration/reset/chỉnh dữ liệu làng.

Public smoke: health 200 / ready đúng release ID; 8 asset JS/CSS trang chủ khớp SHA256 bản build; `/dev/magic-ui` và `/dev/zombies` trả 404. Không dùng private-account smoke; chưa đo độ trễ/FPS trên làng production.

## Hotfix giảm áp lực sau phản hồi Bến Vân Đồng

Giảm vừa phải đời 6–9, giữ sửa đường đi, sát thương, tốc độ, lịch và ngưỡng tối thiểu 8 con. Hệ số số lượng từ 2/2,25/2,5/2,75 xuống 1,75/1,95/2,15/2,35. Máu normal = 210 + 45×growth, super = 600 + 90×growth, breaker = 900 + 140×growth (growth=era−6, tối đa 3). Đời 1–5 giữ nguyên.

Mẫu đời 7, áp lực 1.717 dân: 97→84 con; tổng máu đợt 56.360→40.070, giảm 28,9%. HP normal 300→255, super 840→690, breaker 1.280→1.040. Số lượng/maxHp mới áp dụng khi sinh đợt mới; không chỉnh trực tiếp actor hoặc dữ liệu production. Các bộ đếm thiệt hại là lũy kế, không quy toàn bộ cho release vừa rồi.

TypeScript và 62 tests zombie/spread/magic integration đạt; test mới khóa mẫu quy mô Bến Vân Đồng và chu kỳ 15 phút.
