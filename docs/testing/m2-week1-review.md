# Audit tuần 1 sau merge PR #20/#21

Đối chiếu 2026-10-26: PR #20 merged tại `fbbc97d`, PR #21 merged tại `b8935d1`,
cùng base develop. [CI develop b8935d1](https://github.com/neyugn261/pbl6-saas-equipment/actions/runs/40334613431)
đã SUCCESS. API GitHub xác nhận merge; review đã thấy chỉ có bot COMMENTED,
không có bản ghi APPROVED để xác nhận người cụ thể đã duyệt.

**Kết luận:** đủ phạm vi triển khai tuần 1 (K1/K2/K3); có thể triển khai tuần 2.
Chưa phải kết luận mọi luồng M2 đã đúng hoặc đã nghiệm thu M2 toàn nhóm.

| Hạng mục | Kết quả |
| --- | --- |
| Nền tảng/shared auth/validation/health/env/outbox | Có trong bản merge, build và CI đạt |
| Technician/Skill/me/PATCH | Đủ endpoint theo phần tuần 1; tenant/reference/uniqueness có DB tests |
| WO create/read/update/history/internal | Đã có; một live WO/SR, sequence/history/log/outbox cùng transaction |
| Gateway/Created v1 → SR PROCESSING | Smoke thật tuần 1 đạt; chạy lại cùng thay đổi tuần 2 vẫn đạt |
| UUID viết hoa/thường | Phát hiện edge case ở so sánh JS và khóa chuỗi; sửa riêng `0b9405f`, DB regression đạt |
| Create/cancel và workflow/report | Thuộc tuần 2; không đánh giá thiếu tuần 1 vì chưa triển khai |
| H4 stale WO event trên SR | Đã tái hiện, ngoài owner WO; Khương giao Huy xử lý trước nghiệm thu nhánh thay thế |

Bản sửa UUID chuẩn hóa so sánh reference với UUID do PostgreSQL trả về, đồng
thời chuẩn hóa tenant/SR ID trước hash advisory lock. Không đổi dữ liệu lưu,
API contract hoặc schema. Test tuần 1 tăng từ 16 lên **17**; tuần 2 kiểm tra thêm
mixed-case ở assignee và source-lock khi create/cancel chạy đồng thời.

Nguồn: [bằng chứng tuần 1 gốc](m2-week1-test-cases.md),
[kiểm thử tuần 2](m2-week2-test-cases.md), [H4](h4-stale-work-order-events.md).
