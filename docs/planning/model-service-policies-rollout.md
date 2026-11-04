# Rollout / rollback — ADR 0018

## Phạm vi và thứ tự

Base: `origin/develop` tại `b19ce17`; branch `feature/model-service-policies`.
Không backfill dữ liệu legacy. Không sửa migration đã áp dụng. Không chạy seed/reset
trên database demo/chung để kiểm thử.

1. Review ADR 0018, contract `docs/api/model-service-policies.yaml`, event catalog
   và SQL additive. Thực hiện backup theo quy trình môi trường triển khai.
2. Chạy migration Asset, Maintenance, Work Order và Service Request bằng cấu hình
   đúng DB của từng service. Chạy lại để kiểm tra idempotency và `pnpm db:check-drift`.
3. Deploy Work Order consumer nhận cả Maintenance v1/v2; deploy các consumer đọc
   completion projection mới. Giữ Asset `MODEL_POLICIES_ENABLED=false` trong bước này.
4. Deploy Maintenance với profile/group/scheduler mới. Legacy Plan vẫn phát v1;
   policy Plan mới phát v2, mỗi nguồn chỉ phát một version.
5. Deploy Asset/SR/Gateway và Web; cập nhật Android để ghi checklist. Client cũ
   không thể vượt completion guard của WO có checklist.
6. Kiểm tra health, subscription, retry/DLQ và chạy `pnpm test:model-policies` trên
   **các DB test riêng**. Mở cờ `MODEL_POLICIES_ENABLED=true` cho bàn giao mới sau
   review. Không gọi script integration với dữ liệu production.

## Kiểm thử tái lập

Cần Node 24, pnpm 11.26, PostgreSQL 17, RabbitMQ và sáu biến URL
`{IDENTITY,ORGANIZATION,ASSET,MAINTENANCE,WORKORDER,SERVICE_REQUEST}_TEST_DATABASE_URL`.
Script từ chối DB không có tên test hợp lệ, tự migrate, dựng app trên port tạm,
đăng nhập Identity thật, cô lập exchange RabbitMQ và dọn các queue của nó khi kết thúc.
Nó không truncate DB; fixture có tenant ngẫu nhiên, chỉ dùng trong DB test.

```sh
pnpm test:model-policies
# Browser: Playwright cài riêng ngoài repository; Chromium đã cài sẵn.
MODEL_POLICY_BROWSER=true PLAYWRIGHT_MODULE=/path/to/playwright pnpm test:model-policies
# Android: emulator riêng đang chạy, adb và Flutter có trên PATH.
MODEL_POLICY_ANDROID=true pnpm test:model-policies
```

Artifacts UAT mặc định `/tmp/pbl6-model-policy-uat`; có thể đổi `POLICY_ARTIFACTS`.
`FLUTTER_BIN`, `ADB_BIN`, `POLICY_TEST_DEVICE` cấu hình công cụ/platform. Android
suite build debug với địa chỉ Gateway tạm, chỉ xóa dữ liệu app test trên emulator
được chỉ định để đăng nhập lại. Không dùng điện thoại chứa dữ liệu người dùng.
Chạy các suite DB khác tuần tự sau integration, vì suite cũ có thể truncate bảng.

## Rollback

Đặt `MODEL_POLICIES_ENABLED=false` và restart Asset: preview/submit theo Model mới
trả 503; resume các hồ sơ đã PENDING vẫn hoạt động. Giữ consumer v1/v2, endpoint
maintenance-group và completion guard/checklist cho dữ liệu đã tạo. Cờ không tắt
scheduler cho Plan hiện có; nếu cần dừng phát sinh công việc, dùng công tắc
`MAINTENANCE_SCHEDULER_ENABLED=false` hiện hành và giám sát backlog.

Không rollback schema bằng DROP hoặc chạy binary cũ không hiểu v2 khi vẫn còn
Task/WO/PENDING theo Model. Không retire/đổi default rồi sửa snapshot để phục hồi.
Kiểm tra bằng registration ID, inputHash và group receipt; chỉ sửa dữ liệu thủ công
sau đối soát theo owner service. Không lưu token vào lệnh retry.

## Gate phát hành

Xem báo cáo kiểm thử cùng nhánh. Code Owner/schema/auth review, PR approval ngoài
tác giả và nghiệm thu môi trường triển khai vẫn phải do thành viên có quyền thực
hiện. Không diễn giải kiểm thử local thành PR đã duyệt hoặc production đã deploy.
