# H4 — Event WO cũ thay đổi nhầm lifecycle WO mới trên Service Request

- Owner theo phân công: **Huy — Service Request (M2-H4)**.
- Khương xác nhận giao Huy xử lý trong phiên làm việc 2026-10-26.
- Baseline: `develop` **`b8935d1`**, sau merge PR #20/#21.
- Trạng thái: **đã tái hiện bằng consumer thật + persistence giả; chưa sửa**.
- Chặn nghiệm thu nhánh WO thay thế/retry/reopen có tạo WO mới; không được dùng
  kết quả happy-path tuần 2 để kết luận đã xử lý mọi thứ tự event.

## Tái hiện

```bash
pnpm build:packages
pnpm --filter service-request-service build
node scripts/repro-h4-stale-workorder.cjs
```

Kết quả baseline:

```text
Created(new WO): PROCESSING
Delayed Cancelled(old WO): ACCEPTED
H4 reproduced: old WO event changed the newer WO lifecycle
```

Script cố ý **exit 1 khi vi phạm invariant**. Đây là diagnostic thủ công, không
được thêm vào CI như một test phải xanh khi lỗi còn tồn tại. Script gọi class
consumer thật từ bản build, dùng persistence double và hai event ID khác nhau;
không đọc/ghi DB, không phải bằng chứng DB/e2e. Huy cần thêm regression DB thật
khi sửa; cập nhật harness nếu thiết kế persistence/contract thay đổi.

## Vì sao tình huống có thể xảy ra

1. WO A được tạo khi SR ACCEPTED, nhưng event Created A chưa đến SR.
2. WO A bị hủy ở WO DB; SR vẫn ACCEPTED vì event lifecycle chưa được xử lý.
3. WO B được tạo hợp lệ từ SR ACCEPTED; Created B tới trước, SR → PROCESSING.
4. Cancelled A tới muộn. Consumer hiện xét SR/equipment/trạng thái, không xác
   minh A có phải WO hiện hành, nên đưa SR về ACCEPTED dù B còn đang xử lý.

ADR 0005 cho phép event đến sai thứ tự sau retry; inbox chỉ chống cùng một
event ID bị xử lý hai lần, không phân biệt hai lifecycle WO khác nhau.

Nguồn: [consumer SR](../../apps/service-request-service/src/events/work-order-events.consumer.ts),
[diagnostic](../../scripts/repro-h4-stale-workorder.cjs),
[ADR transport](../decisions/0005-event-transport.md).

## Tiêu chí bàn giao cho Huy

- [ ] Chốt cách xác định lifecycle/WO hiện hành và thứ tự giữa các WO của cùng
  SR trước khi sửa schema hoặc event contract; review với Khương/Nguyên.
- [ ] Event của WO cũ không đổi trạng thái hoặc summary của WO mới.
- [ ] Created/Completed/Cancelled đến sai thứ tự được xử lý hoặc retry rõ ràng;
  không âm thầm bỏ một event nghiệp vụ mới vì SR chưa tới trạng thái cần thiết.
- [ ] Giữ nguyên invariant SR terminal, cancellation intent v2 và customer-safe
  summary; không gọi WO đồng bộ từ consumer để thay mô hình dữ liệu (ADR 0004).
- [ ] Có DB tests cho event cũ, duplicate, terminal, completed-before-created,
  cancellation/replacement và rollback inbox; có bằng chứng broker thật.
- [ ] Nếu cần migration/backfill hoặc event field/version mới, đối chiếu ERD,
  dữ liệu đã có và consumer khác; không giả định timestamp đơn thuần cho mọi
  aggregate là đủ, không chỉnh migration/event version cũ không tương thích.

Khương tuần 2 giữ nguyên schema/contract của Service Request; chỉ triển khai
K4/K5 bên Work Order. H4 không nằm trong các kiểm tra tuần 2 đã báo Pass.
