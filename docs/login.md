# Đăng nhập và quyền vào làng

- Google là cách vào game bắt buộc. Màn chào có giới thiệu, các thời đại và hướng dẫn ngắn; chỉ hiện form đặt tên sau khi đăng nhập.
- `playerId()` chỉ trả làng được gắn vào tài khoản của phiên đăng nhập và có `owner` khớp. Cookie `pid` riêng lẻ không cấp quyền chơi.
- `GET /api/city` trả 401 với `needsLogin` khi chưa đăng nhập; tài khoản chưa có làng nhận 404 với `needsName`. `POST` yêu cầu đăng nhập và luôn ghi `owner`.
- Làng khách cũ không bị xóa. OAuth callback giữ cơ chế nhận làng khách trong trình duyệt khi tài khoản chưa có làng. Tài khoản đã có làng tiếp tục dùng làng của tài khoản.
- Cảnh làng ở màn chào là mẫu cố định dùng renderer hiện có, chỉ vẽ khi thay đổi kích thước; không gọi API hoặc chạy mô phỏng.

Kiểm tra: `bun test tests/city-auth.test.ts` (chạy riêng để cô lập module mocks); `bun run type-check`; `bun run build`. Luồng OAuth thật cần Google credentials và phiên đăng nhập phù hợp; không sử dụng database production để thử local.
