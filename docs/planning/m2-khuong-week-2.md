# M2 — Tuần 2 của Khương

Cập nhật 2026-10-26. Baseline `develop b8935d1` đã merge PR #20/#21.
Code tuần 2: `687d911`, phụ thuộc bản sửa UUID `0b9405f`.
Kế hoạch tổng: [M2 Khương](m2-khuong.md). Kiểm chứng:
[bằng chứng tuần 2](../testing/m2-week2-test-cases.md).

## Mục tiêu và trạng thái

**K4 đã triển khai/test local; K5 phía WO đã triển khai/test local.** Chờ review,
CI của PR mới và merge. Chưa nghiệm thu M2 toàn nhóm hoặc app web/Android.

| Phần việc | Đầu ra đã có | Trạng thái |
| --- | --- | --- |
| Audit tuần 1 | Đối chiếu merge, develop CI, endpoint và DB tests; sửa UUID viết hoa/thường | [Kết quả audit](../testing/m2-week1-review.md) |
| K4 assignment | Assign/reassign/accept/reject, lịch sử và BUSY theo assignment ACCEPTED | Code + DB tests đạt |
| K4 thực thi | Travel/start/hold/resume, log, quyền OR, allowedActions | Code + DB tests đạt |
| K4 report | Một report/WO; complete nguyên tử; Completed v2 chỉ có customerSummary | DB tests và broker smoke đạt |
| K5 cancel API | Cancelled v2 với intent mặc định false; true chỉ cho nguồn SR | DB tests và broker smoke đạt |
| K5 consumer | Inbox, auto-cancel ba trạng thái đầu, cảnh báo khi đang thực hiện; chung khóa create | DB tests đạt; wiring broker đã chạy trong stack |
| Tích hợp SR | RESOLVED → confirm, PARTIALLY_RESOLVED → reopen, UNRESOLVED → ACCEPTED | Gateway + RabbitMQ thật đạt; không tạo WO thay thế |
| H4 | Event WO cũ làm sai lifecycle SR khi có WO mới | Khương chốt giao Huy sửa trước nghiệm thu nhánh thay thế |

## Cách chia việc để review

1. PR fix UUID riêng dựa trên develop: normalize so sánh reference và khóa SR;
   regression DB, không thay role/schema.
2. PR K4/K5 dựa trên fix: chỉ service WO và tài liệu bàn giao/diagnostic.
3. PR tích hợp CI dùng chung dựa trên K4/K5: root script, smoke tuần 2, queue
   doc và bước CI. Nguyên review theo CONTRIBUTING; chỉ tăng login limit trong
   job smoke, không thay mặc định production/development của Gateway.

Merge theo thứ tự fix → K4/K5 → CI; sau mỗi merge đổi base PR kế tiếp về develop.
Mỗi PR vẫn cần reviewer ngoài tác giả; không tự merge vì CI xanh.

## Việc Khương cần làm tiếp

- Review/merge các PR tuần 2 cùng reviewer; Nguyên/Hatsady dùng API trong
  [README WO](../../apps/workorder-service/README.md) để nối Android/Web.
- Huy sửa [H4](../testing/h4-stale-work-order-events.md), thêm DB regression và
  bằng chứng broker cho event cũ/WO mới trước nghiệm thu replacement/reopen
  tạo WO mới. Đã ghi phân công trong repo; chưa xác nhận Huy đã nhận hoặc sửa.
- Sang K6 với Minh: chốt contract yêu cầu thay thế do Service Manager chủ động,
  identity chống trùng, retry/thứ tự event. Chưa tự chọn schema/event mới.
- K7 còn ca ngoài bảo hành/Estimate, UI Android/Web và Asset history/Maintenance.
- K8 contract upload cho M3 còn chưa làm; không mở MinIO/upload trong tuần 2.

## Tiêu chí nghiệm thu còn mở

- [x] Lint/typecheck/build, DB/concurrency/rollback và smoke HTTP đã chạy.
- [x] Giữ RBAC D01; không đổi migration/catalog hoặc đọc DB service khác.
- [x] Ghi rõ H4 và phân biệt test dùng fake upstream với stack thật.
- [ ] Reviewer/owner review và merge các PR tuần 2.
- [ ] H4 và các ca replacement/event đảo thứ tự xuyên service được nghiệm thu.
- [ ] Nguyên/Hatsady xác minh UI Android/Web với API thật; chưa có bằng chứng APK/UI.
