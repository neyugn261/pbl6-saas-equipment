# M3 Nguyên — trạng thái sau khi cập nhật develop (02–03/11/2026)

Nhánh: `codex/nguyen-m3-integration`. Tài liệu M3 ngày 31/10 là kế hoạch,
không phải bằng chứng nghiệm thu. Bảng dưới đây đối chiếu code và kết quả
chạy trên nhánh hiện tại. Các thay đổi D1 trong nhánh cần Huy review contract
trước khi ghép consumer Notification.

| Task | Hiện trạng | Bằng chứng / việc còn lại |
| --- | --- | --- |
| D1 shared contracts + Identity | Producer, outbox/revision, bootstrap, activation delivery và Mailpit đã triển khai | Event package 24 PASS; Identity unit 16 PASS, E2E 92 PASS; schema drift 0; bootstrap test 2/2 snapshot + marker. Demo: 8 snapshot + 1 marker đều PUBLISHED lên RabbitMQ, Gateway invite→Mailpit SMTP PASS và job SENT/ciphertext NULL. Huy cần review contract và triển khai Notification projection/consumer; chưa có C3 end-to-end. |
| D2 compose staging/demo | Đã có image, migrate gate, service health, volume và network riêng | `docs/deployment/m3-demo.md`; backend image mới build, migration/seed demo PASS, Identity mới healthy và kết nối RabbitMQ, Mailpit đã nhận thư. |
| D3 Gateway + MinIO | Public mapping Notification/SR và signed storage theo runbook; private bucket | Gateway→MinIO signed PUT/GET smoke đã ghi trong runbook. SR C4/controller và Notification API thật phụ thuộc owner Huy. |
| D4 Mobile file | Client và màn hình live có camera/gallery/file, hash, prepare/PUT/finalize, tải URL, retry cùng key, phần trăm byte PUT và hủy PUT đang chạy | Android Files→Gateway→MinIO upload/finalize và Chrome signed download PASS trên emulator; phần trăm/hủy/đổi phiên đã qua unit, chưa thử thao tác hủy giữa PUT trên thiết bị với tệp lớn. |
| D5 Mobile/CI regression | Flutter analyze, 106 test toàn bộ, thêm 1 test hồi quy targeted và APK debug PASS; Android runtime đã chạy | Demo Gateway: Manager phân công, Technician nhận việc, bắt đầu, gửi báo cáo, WO hoàn thành, đính kèm tệp báo cáo và tải xuống PASS trên emulator. Lỗi mất trạng thái upload khi quay lại từ Android Files đã được sửa và thử lại thành công. |
| D6 Runbook/bàn giao | Runbook build/migrate/start/health/stop, storage/RabbitMQ/Mailpit/bootstrap | `docs/deployment/m3-demo.md`; một người khác cần dựng lại stack và chạy nghiệp vụ toàn tuyến để nghiệm thu cuối. |

## Lệnh kiểm tra D1 đã chạy

- `identity_test_db`: migration mới apply thành công; `prisma migrate diff` báo `No difference detected`.
- Identity: TypeScript, oxlint, Nest build, unit 16/16, DB E2E 92/92.
- Shared events: TypeScript và 24/24 unit PASS (3 test tích hợp RabbitMQ được skip theo cấu hình package).
- Compose demo: `docker compose --env-file infrastructure/demo.env.example -f compose.demo.yml config --quiet` PASS.
- Mailpit: optional `mailpit.e2e-spec.ts` PASS trên `identity_test_db`, Mailpit API xác nhận đúng recipient. Không in token hoặc link vào evidence.
- Demo stack 03/11: backend image build PASS; migration Identity mới và seed PASS;
  Identity healthy, kết nối RabbitMQ. Bootstrap tenant demo tạo 8 snapshot và
  1 marker; tất cả 9 row `outbox_events` ở trạng thái `PUBLISHED`. Gateway
  invite tài khoản thử nghiệm→Identity worker→Mailpit PASS; job `SENT` và
  ciphertext `NULL`. Notification consumer chưa nhận vì C3 chưa triển khai.

## Phụ thuộc trước khi đánh dấu M3 hoàn tất

1. Huy review/merge hai event v1, triển khai recipient projection, durable pending,
   customer context và Notification API; sau đó chạy bootstrap→RabbitMQ→C3 thật.
2. Ghép SR C4 của Huy với WO A4 và Gateway để chạy file CUSTOMER end-to-end.
3. Thử hủy giữa PUT và retry với tệp lớn trên Android; unit đã bao phủ nhưng
   lần upload demo 67 byte hoàn tất quá nhanh để thao tác hủy.
4. Dựng lại stack từ nhánh sau khi merge và chạy toàn tuyến cùng Notification
   consumer và Service Request/Customer Portal của các owner liên quan.

## Android runtime 03/11/2026

- Emulator `Medium_Phone`, APK debug dùng `API_BASE_URL=http://10.0.2.2:3009`.
  Demo Technician đăng nhập qua Gateway; Manager phân công WO-2026-0001,
  Technician nhận việc, bắt đầu và gửi Service Report qua ứng dụng. Work Order
  chuyển `COMPLETED`, báo cáo `64fe3ed4-36ed-4729-a9c0-e3b70e588796`.
- Android Files chọn `m3-android-confirm.png` (67 byte), ứng dụng prepare,
  signed PUT và finalize thành công; tệp xuất hiện ở danh sách report attachment
  và thông báo “Đã đính kèm”. Ở APK trước, refresh khi quay lại từ file picker
  tháo widget upload dù yêu cầu đã thành công; `job_reads.dart` hiện giữ màn
  chi tiết trong lúc refresh. APK mới thử lại PASS.
- Tệp thử 6 MiB cũng upload/finalize trên emulator; kết nối local vẫn hoàn tất
  trước khi có thể bấm hủy, nên chưa tính là PASS cho thao tác hủy giữa PUT.
- Chạm tệp báo cáo mở Chrome với signed URL; Chrome tải một bản 67 byte vào
  Downloads. URL ký và thông tin đăng nhập không được lưu trong tài liệu.
- MinIO public URL của môi trường local được đổi trong `.env.demo` bị git ignore
  từ `localhost` sang địa chỉ LAN máy chủ để emulator truy cập; khi dựng lại
  phải chọn địa chỉ mà thiết bị truy cập được. Camera, ảnh gallery, hủy PUT
  giữa chừng và đổi tài khoản trong lúc upload chưa được kiểm trên emulator.
