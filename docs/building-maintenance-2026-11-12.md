# Bảo trì HP công trình — 12/11/2026

Bản phát hành bảo trì HP: `building-maintenance-20261112`. Kết quả deploy ghi trong biên bản phát hành sau khi xác minh production.

- Chọn công trình để xem HP hiện tại/tối đa. Khi mất HP do zombie, có nút Bảo trì và giá trước khi xác nhận.
- Phí từng vật liệu = ceil(giá vật liệu cấp hiện tại × HP mất / HP tối đa), dùng đúng hệ số thời đại hiện hữu. Ví dụ mất 25% HP trả 25% giá cấp hiện tại, làm tròn lên từng loại.
- Action `maintain` kiểm tra và tính giá lại ở backend sau settlement, thanh toán một lần rồi xóa `zombieDamage`. Không tin giá từ client. Thiếu vật liệu thì không thanh toán/hồi HP; đã đầy HP không thu thêm phí.
- Không đổi cấp, building instance, ngày xây, investment, hoặc chữa cháy/ngập. Nút Sửa thiên tai vẫn giữ nguyên. Công trình bị phá hủy/đang xây không bảo trì được; trong trận PvP chờ trận kết thúc để không thay HP khác snapshot chiến đấu. Không thêm luật cấm bảo trì khi zombie còn hiện diện.
- Công trình bị phá hoàn toàn vẫn phải xây mới. Không thay đổi schema lưu hoặc dữ liệu production.

Kiểm chứng:

- 7 test mới về báo giá nhiều cấp/thời đại, làm tròn, thanh toán/hồi HP một lần, thiếu tài nguyên, kết hợp cháy/ngập, công trình bị phá/đang xây/PvP, tính lại giá backend, JSON reload và JSON action validation.
- 608/608 test logic toàn repo; TypeScript, renderer và Cloudflare production build local qua.
- Browser synthetic `http://127.0.0.1:3017/dev/magic-ui?maintenance=1`: bệnh viện cấp 3 từ 12900/25800 lên 25800/25800 HP. Giá báo 6000 đá + 1600 đồng + 1000 vàng. Sau thành công nút bảo trì biến mất, cấp/nhân sự/xe giữ nguyên.
- Desktop và mobile 390×844: thao tác được, không lỗi console; document width = viewport width = 390.

Log local: `/tmp/maintenance-{tests,full-tests,render,build,worker,api}.log`.
