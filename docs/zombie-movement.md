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

## Zombie locator and committed pursuit (local, not released)

- The village threat banner locates the next emerged, living zombie. A red ring and label identify the selected actor; the map toolbar can recenter or cycle targets. The zombie panel lists coordinates and individual location buttons. Pending actors are counted separately and have a pending marker when selected.
- Dead and expired actors are excluded. Once the selected actor disappears, recenter is disabled and the player can select the next actor.
- Distant actors now approach the closest village structure rather than idling outside the local detection radius. Valid targets are held for at least five seconds unless a nearby soldier intercepts; civilian contact and guard pursuit limits still apply.
- Routes remain stable until the target moves to a different tile or the next step is blocked. Replanning preserves the unfinished edge to avoid walking back toward a cell center. Failed routes retry with a two-second cooldown. Close pursuit accounts for the victim's fractional position to reach melee range.
- Drawing interpolates the previous simulated second without predicting future movement. Wilderness renewal protects live zombie positions and paths.
- The local `/dev/magic-ui` harness includes “Thử định vị zombie”: two emerged actors and one pending actor, without production account data. Desktop and 390px mobile checks covered banner location, target cycling, red marker and disabled recenter after death.
- Economic resource/crafting test fixtures postpone zombie waves beyond their simulated window, so the new long-range attacks do not destroy unrelated production fixtures.
