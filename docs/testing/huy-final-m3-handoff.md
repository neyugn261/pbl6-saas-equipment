# Handover HU-01 → HU-04 — trạng thái tại 16/11/2026

Đây là báo cáo trạng thái của checkout hiện tại, không kế thừa kết quả PASS từ
các lần chạy trước. Các thay đổi đang có trong worktree chưa được commit, push
hay merge.

## A. Git status

- Branch: `huyM4`
- HEAD: `70829ff`
- `origin/develop` sau fetch: `262342b`
- So với `origin/develop`: 0 commit ahead, 3 commit behind.
- `git diff --check`: PASS.
- Không reset, rebase, merge, commit hoặc push. Không sửa Compose/CI, Web,
  Work Order, Asset hay migration đã áp dụng.
- Migration mới trong worktree: `apps/identity-service/prisma/migrations/20261114090000_password_recovery`.

Thay đổi đã có trong worktree:

- Identity: auth/password recovery, cấu hình SMTP/OTP, delivery worker, Prisma
  schema/migration, tests, README và OpenAPI.
- Service Request: follow-up projection, branch allocation/no-op protection,
  tests và Gateway acceptance script.
- Notification: recipient/fan-out changes, tests và recipient matrix.
- Handoff/evidence tooling: `docs/changesets/`, `docs/erd/`,
  `docs/planning/`, `docs/testing/`, `scripts/`.
- Tài liệu được bổ sung trong lần hoàn thiện này:
  [identity-password-otp.md](../api/identity-password-otp.md) và báo cáo này.

## B. Tình trạng theo task

| Task | Implementation | Kiểm tra hiện tại | Trạng thái |
| --- | --- | --- | --- |
| HU-01 — INSPECTION | Consumer đã dùng `WorkOrderCompletedV2.type`, ledger theo occurrence, đưa SR về `REVIEWING` và không set `resolvedAt` cho khảo sát. Estimate vẫn theo lifecycle hiện có. | Unit PASS; SR DB lifecycle 13 PASS; migration thật PASS. Gateway/RabbitMQ acceptance runner kết thúc bất thường trước assertion. Thiếu trường chẩn đoán trong event; xem blocker F. | PARTIAL |
| HU-02 — hàng chờ/Notification | Có filter unallocated/follow-up, scope branch/tenant, no-op allocation không tạo lịch sử/event, recipient và nội dung Notification theo kết quả. | Unit PASS; HTTP E2E SR 28 và Notification 6 PASS; SR DB request/attachment 64 PASS; Notification DB/RabbitMQ 21 PASS. Gateway acceptance runner lỗi; Web UAT NOT_RUN. | PARTIAL |
| HU-03 — tích hợp E2E | Acceptance script đã chạy trên PostgreSQL/RabbitMQ/Mailpit cô lập; đủ build, migrations và service-level DB suites. | Gateway acceptance runner kết thúc với Windows exit `3221226505` trước assertion; không có kết quả PASS đầu-cuối. | PARTIAL / BLOCKED |
| HU-04 — password/OTP | Backend, persistence, OTP email worker, OpenAPI và contract handoff đã có trong worktree. | Unit PASS; Identity PostgreSQL E2E 100 PASS (3 skipped); password recovery 6 PASS; Mailpit SMTP 2 PASS. Gateway HU-04 scenario chưa chạy do acceptance runner exit bất thường. Cần owner Identity review. | PENDING_OWNER_APPROVAL |
| KH-03 — KPI review | Đã đọc implementation/test trên `origin/develop` (`571dac6`, merge `262342b`). Không sửa Work Order. | Review source/test assertions; không chạy KPI PostgreSQL E2E trên branch hiện tại. | CODE REVIEW ONLY |

## C. API handoff Identity

Contract Web/Gateway: [identity-password-otp.md](../api/identity-password-otp.md);
OpenAPI: [identity.yaml](../api/identity.yaml).

- `POST /api/identity/auth/change-password` — bearer token, current/new password,
  `204`; thu hồi refresh sessions.
- `POST /api/identity/auth/forgot-password` — public, email và tenantCode tùy
  chọn; response chung `202` gồm message và `challengeId`; gọi lại để resend,
  challenge cũ vô hiệu.
- `POST /api/identity/auth/reset-password` — public, challengeId + OTP 6 chữ số
  + mật khẩu mới; `204` khi thành công.
- OTP mặc định 5 phút, tối đa 5 lần sai, one-time use; giới hạn tần suất được
  nêu chi tiết trong contract. Không trả hoặc log OTP.
- SMTP cần cấu hình an toàn; Mailpit dùng cho demo/test. IP throttling sau
  Gateway cần trusted proxy được owner cấu hình.
- JWT access đã phát có thể còn hiệu lực ở service xác thực offline đến hết hạn
  theo ADR 0004; không tuyên bố thu hồi tức thời toàn hệ thống.
- API contract đã được ghi thành tài liệu để Nguyên nối Web/review. Chưa có
  bằng chứng gửi qua PR/chat, Gateway/Web E2E hoặc owner approval trong phiên này.

## D. Bằng chứng kiểm tra trong phiên

| Lệnh/kiểm tra | Kết quả |
| --- | --- |
| `pnpm.cmd --filter identity-service --filter service-request-service --filter notification-service lint` | PASS |
| `pnpm.cmd --filter identity-service --filter service-request-service --filter notification-service typecheck` | PASS |
| `pnpm.cmd --filter identity-service --filter service-request-service --filter notification-service test --runInBand` | PASS — Identity 26, Service Request 103, Notification 74 (203 tests) |
| `pnpm.cmd --filter identity-service --filter service-request-service --filter notification-service build` | PASS |
| `pnpm.cmd demo:build` | PASS — build packages và 8 backend services |
| `git diff --check` | PASS |
| `pnpm.cmd --filter identity-service --filter service-request-service --filter notification-service db:check-drift` | PASS — không phát hiện drift trên DB test cô lập |
| `pnpm.cmd --filter service-request-service test:e2e:db --runInBand` | FAIL — Windows process exit `3221226505`; các file requests, attachments và lifecycle chạy riêng đều PASS |
| `pnpm.cmd --filter identity-service test:e2e` | PASS — 100 passed, 3 skipped |
| `pnpm.cmd --filter identity-service test:e2e --testPathPatterns=password-recovery.e2e-spec.ts` | PASS — 6 PostgreSQL tests |
| `pnpm.cmd --filter identity-service test:e2e --testPathPatterns=password-mailpit.e2e-spec.ts` | PASS — 2 Mailpit SMTP tests |
| `pnpm.cmd --filter service-request-service test:e2e:db --testPathPatterns=requests.e2e-spec.ts` | PASS — 45 PostgreSQL tests |
| `pnpm.cmd --filter service-request-service test:e2e:db --testPathPatterns=attachments.e2e-spec.ts` | PASS — 19 PostgreSQL tests |
| `pnpm.cmd --filter service-request-service test:e2e:db --testPathPatterns=work-order-lifecycle.e2e-spec.ts` | PASS — 13 PostgreSQL tests |
| `pnpm.cmd --filter notification-service test:e2e:db --runInBand` | PASS — 21 PostgreSQL/RabbitMQ tests |
| `pnpm.cmd --filter service-request-service test:e2e` | PASS — 28 HTTP E2E tests (test dependency boundary, not cross-service integration) |
| `pnpm.cmd --filter notification-service test:e2e --runInBand` | PASS — 6 HTTP E2E tests (test dependency boundary, not cross-service integration) |
| `node scripts/test-branch-service-management.cjs` (`HUY_ACCEPTANCE=true`, test DB/RabbitMQ cô lập) | FAIL — process exit `3221226505` (Windows `0xC0000409`) sau khi khởi tạo các app, trước assertion/kết quả cuối |

Các DB, broker và SMTP E2E chạy trên container test cô lập; migrations được triển
khai cho tám service DB test. Gateway acceptance chưa có kết quả nghiệp vụ do
runner exit bất thường; không tính là PASS. Web UAT, Android/APK và staging
không chạy. Docker Compose chung không được thay đổi.

### Review KH-03

Source trên `origin/develop` lọc theo `completed_at` trong khoảng nửa mở
`[from,to)`, trả `Asia/Ho_Chi_Minh`; mẫu số sửa thành công chỉ gồm
`REPAIR`/`WARRANTY` có kết quả kỹ thuật, tử số là `RESOLVED`. Tỷ lệ đúng hạn
chỉ gồm WO có `scheduled_end`. Attribution ưu tiên technician của service
report, dự phòng assignment có trạng thái `COMPLETED` mới nhất. Test trong commit
`571dac6` có dữ liệu đổi phân công, biên thời gian +07:00, INSPECTION/MAINTENANCE,
tenant/branch isolation và trường hợp không đủ dữ liệu. Đây là review code/test,
không phải kết quả chạy test hay nghiệm thu Web.

## E. Bàn giao theo owner

- **Nguyên:** review Identity; tích hợp Gateway/Web theo contract; xác nhận
  trusted proxy và chạy Web UAT; cung cấp bằng chứng Compose/CI.
- **Khương:** đối chiếu event `WorkOrderCompletedV2` với các trường khảo sát cần
  lưu; cung cấp hai fixture `PARTIALLY_RESOLVED`/`UNRESOLVED`; chạy producer
  Work Order thật và xác nhận KPI E2E.
- **Minh:** chưa có nhiệm vụ Asset/bulk handover trong HU-01→HU-04 hiện tại.
- **Huy:** giữ thay đổi Service Request/Notification/Identity chưa commit; hoàn
  tất E2E sau khi stack, fixture và review owner sẵn sàng.

## F. Blocker và bước tiếp theo

1. **Thiếu dữ liệu chẩn đoán trong event:** contract và producer đang có
   `type`, `serviceReportId`, `result`, `completedAt`, `customerSummary`,
   `unresolvedReason` và checklist tùy chọn; không có
   `serviceReport.problemSummary`/`solutionSummary`, cũng không phát
   `problemDescription`/`solution` nội bộ. Consumer không được truy vấn trực tiếp
   Work Order DB. Khương/Huy cần thống nhất payload an toàn và version/event
   contract theo ADR 0005 trước khi tuyên bố lưu đủ nội dung khảo sát; không tự
   sửa producer hoặc contract trong phạm vi này.
2. **HU-04 chờ phê duyệt:** thay đổi Identity là phân công bổ sung. Nguyên cần
   review contract, migration, SMTP/IP configuration và implementation trước
   merge/phát hành.
3. **Gateway acceptance runner lỗi trên Windows:** `node scripts/test-branch-service-management.cjs`
   thoát `0xC0000409` sau khi khởi
   tạo các app nhưng trước assertion/kết quả. Chạy lại trên Linux hoặc debug
   runner; không coi các DB suite riêng là bằng chứng E2E Gateway. Các container
   test cô lập đã dừng sau kiểm tra.
4. **Checkout chậm hơn develop:** local `huyM4` còn thiếu ba commit mới nhất,
   trong đó có KPI/KH-02. Tích hợp cần được điều phối sau khi bảo toàn/review
   worktree hiện tại; không tự merge/rebase thay nhóm.
5. **KPI:** code review không thấy sai lệch rõ với công thức trong kế hoạch; cần
   chạy suite PostgreSQL và đối chiếu dữ liệu demo sau khi các commit mới được
   tích hợp.
