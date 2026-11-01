# M3-A5 — Work Order report aggregate

Owner: Khương. Consumer: Hatsady, dashboard E3. Thiết kế Q5 đã review ở
[A1](m3-khuong-a1.md); API và response chính thức ở
[workorder.yaml](../api/workorder.yaml).

## API cho dashboard

`GET /api/workorders/reports/work-orders/summary` qua Gateway;
trong WO là `GET /reports/work-orders/summary`.

Bearer phải thuộc TENANT_STAFF và có `report:read`: catalog hiện tại cho
TENANT_ADMIN và SERVICE_MANAGER. Tenant lấy từ token, báo cáo toàn tenant.
TECHNICIAN không có quyền xem; tài khoản đồng thời TECHNICIAN và TENANT_ADMIN
vẫn xem toàn tenant theo quyền report. Header/query không đổi được tenant.

Hai query bắt buộc `from`, `to`: RFC3339 có Z hoặc offset, ngày hợp lệ,
`from < to`. Backend so sánh instant UTC theo khoảng **`[from, to)`**.
Chấp nhận tối đa 6 chữ số thập phân như PostgreSQL; không làm tròn mất
microsecond qua JavaScript Date. Chuẩn hóa phản hồi thành UTC với 3 chữ số
thập phân, hoặc 6 khi cần microsecond; UTC year trong 0001–9999.
`timezone` trả cố định `Asia/Ho_Chi_Minh`, không phải bộ lọc.

Ví dụ chọn tháng 11/2026 giờ Việt Nam:

```ts
const query = new URLSearchParams({
  from: '2026-11-01T00:00:00+07:00',
  to: '2026-12-01T00:00:00+07:00',
});
// Gắn bearer theo API client hiện có.
const path = `/api/workorders/reports/work-orders/summary?${query}`;
```

Dùng URLSearchParams để encode dấu `+`. Backend trả from/to tương ứng
`2026-10-31T17:00:00.000Z` và `2026-11-30T17:00:00.000Z`.

| Trường | Ý nghĩa hiển thị |
| --- | --- |
| `createdCount` | Số WO tạo trong kỳ, gồm cả CANCELLED, nguồn SR và Maintenance |
| `createdByStatus` | Trạng thái **hiện tại** của chính cohort WO tạo trong kỳ; luôn đủ 8 key |
| `completedCount` | Số WO đang COMPLETED và có completedAt trong kỳ, kể cả WO tạo trước kỳ |

Không dùng completedCount/createdCount làm tỷ lệ hoàn thành: hai tập độc lập,
completedCount có thể lớn hơn createdCount. Không tính duration hoặc tổng từ
một trang list. Trạng thái cohort có thể đổi sau khi kỳ báo cáo kết thúc.

## Fixture đối chiếu

Khoảng tháng 11 như trên; dữ liệu cùng tenant A:

| WO | createdAt (UTC) | Trạng thái hiện tại | completedAt (UTC) | Góp vào kết quả |
| --- | --- | --- | --- | --- |
| A | 2026-10-31 17:00:00 (đúng from) | CREATED | null | created +1, CREATED +1 |
| B | 2026-11-01 01:00:00 | IN_PROGRESS | null | created +1, IN_PROGRESS +1 |
| C | 2026-11-02 01:00:00 | COMPLETED | 2026-11-03 01:00:00 | created +1, COMPLETED +1, completed +1 |
| D (Maintenance) | 2026-11-04 01:00:00 | CANCELLED | null | created +1, CANCELLED +1 |
| E | 2026-10-01 01:00:00 | COMPLETED | 2026-10-31 17:00:00 (đúng from) | completed +1 |
| F | 2026-11-30 17:00:00 (đúng to) | CREATED | null | Không tính |
| G | 2026-10-01 01:00:00 | COMPLETED | 2026-11-30 17:00:00 (đúng to) | Không tính |

Thêm 3 WO COMPLETED của tenant B, cùng createdAt/completedAt = from, để chứng
minh isolation. Tenant A vẫn có kết quả:

```json
{
  "from": "2026-10-31T17:00:00.000Z",
  "to": "2026-11-30T17:00:00.000Z",
  "timezone": "Asia/Ho_Chi_Minh",
  "createdCount": 4,
  "createdByStatus": {
    "CREATED": 1,
    "ASSIGNED": 0,
    "ACCEPTED": 0,
    "TRAVELLING": 0,
    "IN_PROGRESS": 1,
    "ON_HOLD": 0,
    "COMPLETED": 1,
    "CANCELLED": 1
  },
  "completedCount": 2
}
```

Fixture thực thi được trong
`apps/workorder-service/test/db/reports.e2e-spec.ts`; script Gateway có fixture
tương ứng và tự xóa dữ liệu tenant do chính script tạo.

## Empty, lỗi và runtime

- DB khỏe, không có dữ liệu: 200, hai count = 0 và đủ 8 status = 0.
- Thiếu/sai bearer: 401. Sai role/user type: 403 `FORBIDDEN`.
- Thiếu/sai timestamp, field lạ (kể cả tenantId/customerId/status/timezone/page):
  400 `VALIDATION_FAILED`. Khoảng bằng nhau hoặc đảo: 400 `INVALID_REPORT_RANGE`.
- DB lỗi: 503 `REPORT_UNAVAILABLE`, không trả counts giả. Dashboard hiển thị
  lỗi/retry riêng với trạng thái empty; không đổi lỗi thành số 0.
- 200 có `Cache-Control: no-store`; correlation ID đi qua Gateway.

Một SQL parameterized đọc aggregate từ `work_orders` trong `workorder_db`:
cả ba chỉ số dùng chung statement snapshot. Không phụ thuộc API SR/Inventory,
broker hay MinIO để đọc report. Không cần migration, index hoặc biến env mới;
dùng `WORKORDER_DATABASE_URL` hiện tại.

## Kiểm thử và bàn giao

Đã chạy trên PostgreSQL 17 riêng cho A5, DB `workorder_test_db`, không reset
DB demo/dev của nhóm:

| Kiểm tra | Kết quả |
| --- | --- |
| WO lint / typecheck | Đạt |
| WO unit | 34 test đạt |
| WO bootstrap E2E | 2 test đạt |
| WO PostgreSQL E2E | 210 test đạt, gồm 16 test A5 |
| Gateway E2E | 25 test đạt |
| Gateway → WO → PostgreSQL smoke | 8 kịch bản đạt; build Gateway và WO đạt |

Lệnh chạy lại từ root sau khi cấu hình `WORKORDER_TEST_DATABASE_URL` trỏ
đúng DB test riêng:

```bash
pnpm --filter workorder-service lint
pnpm --filter workorder-service typecheck
pnpm --filter workorder-service test
pnpm --filter workorder-service test:e2e
pnpm --filter workorder-service test:e2e:db
pnpm --filter api-gateway test:e2e
pnpm --filter workorder-service test:reports:gateway
```

DB suite hiện tại có fixture dọn bảng, chỉ chạy trên DB test dành riêng cho
suite. Gateway smoke build Gateway + WO, chạy hai service thật ở port tạm,
kiểm tra fixture, quyền, tenant, validation và headers với PostgreSQL thật.
JWT được ký bằng key test từ `@pbl6/testing`; đây là integration smoke,
không thay thế đăng nhập Identity trong acceptance test của nhóm.

Bước ghép tiếp theo thuộc E3: Hatsady dùng endpoint này cho dashboard,
phân biệt loading/empty/error và đối chiếu fixture 4/2. Khương còn A6:
regression cuối đợt và phối hợp Huy/Hatsady chạy SR composition/acceptance thật.
