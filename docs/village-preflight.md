# T06 — Preflight chỉ đọc trước migration

Ngày 07/11/2026. Đây là phần chuẩn bị độc lập khi soak/canary đang chạy; **chưa
triển khai ownership router, fencing hoặc đổi nơi ghi production**.

`lib/village-preflight.ts` tạo envelope từ snapshot nguồn và proof các quan hệ
được đọc nhất quán. Giữ nguyên City, ACK/high-water, receipt hiện tại lẫn receipt
API cũ, vị trí world, timer và metadata khác. Date được mã hóa ISO; JSON canonical
có checksum SHA-256, rules/engine/protocol/epoch/session rõ ràng. Không settle,
normalize, tăng revision hoặc sửa số tài nguyên trong preflight.

Hoãn chuyển nếu thiếu account/phiên, ledger không khớp, engine cũ, backend nguồn
không còn Mongo, quan hệ chưa được kiểm tra trong snapshot, chợ/caravan/trận/
sứ giả còn hoạt động, quân/thuyền đang triển khai, outbox hoặc thám hiểm còn dở.
Envelope quá 1,5 MiB và dữ liệu không biểu diễn JSON an toàn cũng bị chặn.
Không xóa quan hệ để làm cho làng đủ điều kiện.

## Dry-run Mongo thật

Runner `scripts/village-preflight.ts` chỉ nhận URI loopback, DB `sync_qa_*` và
một ID `sync-qa-*` cụ thể. Không import helper DB ứng dụng để tránh tạo index hoặc
đọc env production ngầm. Dùng transaction read concern `snapshot`; các query
trong session chạy tuần tự theo yêu cầu Mongo driver. Chỉ in ID fixture, revision,
ACK, blockers hoặc checksum/bytes, không in envelope/snapshot/token/email.

```sh
MONGODB_URI='mongodb://127.0.0.1:27028/?replicaSet=syncqa' MONGODB_DB=sync_qa_20261107_e2e bun scripts/village-preflight.ts sync-qa-ui
```

Thử trên làng QA đã đăng chợ: `candidate:false`, blocker
`active-relation:marketOrders`, revision 6 / ACK 2. Sáu test kiểm tra bảo toàn toàn
bộ source, checksum ổn định qua thứ tự key, phát hiện đổi tài nguyên/ACK/owner,
postpone các quan hệ, phiên/engine cũ và dữ liệu không portable.
Một fixture Mongo profile không có quan hệ đang hoạt động trả `candidate:true`,
revision 1 / ACK 20, envelope 43.100 bytes; không in snapshot và không ghi City.

## Giới hạn bắt buộc

- `candidate:true` chỉ là đủ các kiểm tra ở snapshot đó; **không** là quyền đổi
  backend. Sau khi dry-run kết thúc, writer vẫn có thể thay đổi dữ liệu.
- Migrator thật phải flush/fence phiên, kiểm tra lại revision/epoch cùng lúc chốt,
  nạp/checksum DO, rồi mới bàn giao owner. Không dùng kết quả dry-run cũ để flip cờ.
- Checksum là kiểm tra toàn vẹn, không phải chữ ký hoặc bằng chứng phân quyền.
  Không nhận envelope từ client chưa xác thực; chưa có endpoint import thật.
- Định dạng `villageOwner` mới ở helper là contract chuẩn bị; chưa được gắn vào
  production CityDoc/queries. Mọi writer trong T01 còn phải có ownership fence.
- T06 chưa hoàn thành, T08 coordinator và T10 restore vẫn bắt buộc trước G-B.
