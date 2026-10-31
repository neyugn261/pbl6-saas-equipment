# ADR 0012 — Ghi nhận bàn giao và thiết lập dịch vụ ban đầu

- Status: **Accepted — triển khai theo yêu cầu trên nhánh feature; chưa merge**.
- Date: 2026-10-31.
- Scope: Asset, Maintenance và web; tái sử dụng Organization và RBAC hiện tại.
- Design: [Nghiệp vụ/UI](../plans/equipment-registration-and-handover.md),
  [DB/API/migration/retry](../plans/equipment-registration-technical-design.md).
- Contract: [OpenAPI](../api/equipment-registration.yaml).
- References: ADR 0003, 0004, 0007, 0009, 0010.

## Context

API hiện tại tạo được Customer, Site, Model, Equipment, Warranty và Plan riêng
lẻ. Web chưa có luồng nhập đầy đủ sau bàn giao. Database chưa phân biệt chính
sách chưa nhập với lựa chọn không áp dụng và chưa có identity chống lặp HTTP
cho việc tạo Plan khi bước thiết lập bị mất response.

Luồng mới không quản lý bán hàng, kho thiết bị thành phẩm hoặc hợp đồng tính
phí. Tenant là doanh nghiệp cung cấp thiết bị; Equipment luôn gắn customer/site.

## Decisions

1. Asset sở hữu `equipment_registrations`, một lần thiết lập ban đầu trên mỗi
   Equipment. Record giữ draft, lựa chọn bảo hành/bảo trì, người thực hiện,
   phiên bản, identity chống gửi lặp và biên nhận kết quả. Đây không phải trạng
   thái vòng đời/vận hành Equipment và không phải nguồn dữ liệu Plan hiện hành.
2. DRAFT cho sửa theo expectedVersion. Submit áp dụng Warranty và đóng băng
   input trong một transaction Asset; NONE có lý do, UNCONFIRMED không hoàn tất.
   Maintenance NONE có preflight dữ liệu hiện có trước local commit, không
   khẳng định không thể có Plan khác được tạo sau thời điểm đó.
3. Nếu cần CREATE/KEEP Plan, sau local commit Asset điều phối HTTP bằng token
   người gọi. Maintenance lấy input đã đóng băng và reference qua API Asset,
   tự kiểm tra tenant/quyền và ghi DB của mình. Không giữ transaction trong
   lúc chờ HTTP hoặc dùng transaction xuyên database.
4. Maintenance thêm ba cột setup identity/hash/time và unique theo tenant+
   registration vào Plan. Metadata có thể gắn Plan KEEP; không sửa lịch, không
   unique Equipment vì một máy vẫn có thể có nhiều Plan.
5. PENDING_MAINTENANCE bất biến input. Retry/resume dùng cùng registration,
   đối soát và hội tụ về cùng Plan. 404 lookup không cấp quyền mở khóa sửa
   request đang chạy. Không purge identity trong MVP, không có background
   worker giữ token người dùng để thực hiện REST sau này.
6. SERVICE_MANAGER thực hiện đầy đủ; TENANT_ADMIN lưu phần dữ liệu và draft
   được quyền, chưa hoàn tất bước Maintenance. Giữ nguyên catalog, không tạo
   role hoặc machine token mới. CUSTOMER không đọc raw registration/draft.
7. Customer/Site/Model thêm qua form con được lưu như danh mục thật; hủy wizard
   không xóa chúng. QR là hành động sau cùng, lỗi QR không rollback hồ sơ.
8. Không backfill giả chính sách của Equipment cũ; chưa có registration hiển
   thị NOT_RECORDED. Chính sách đã có được tải và người có quyền xác nhận KEEP.

## Consequences and rollout

- Hai migration additive trong đúng service: bảng registration + local
  Warranty FK/index ở Asset; ba cột + unique/check ở Maintenance.
- Cần refactor helper transaction Equipment/Warranty để ghi cùng transaction,
  không nhân đôi rule hoặc gọi một transaction tự mở ở trong transaction khác.
- Gateway generic routes, Organization API, event contracts và permissions
  hiện tại không cần thay đổi cho phương án này.
- OpenAPI bổ sung, SQL ERD và Prisma phải khớp implementation trước merge;
  không chỉnh migration đã applied.
- Cần test quyền dưới khóa, concurrent submit/resume, mất response sau commit,
  replay sau Plan thay đổi, legacy và UI lỗi. Lint/build đơn lẻ không nghiệm thu
  được luồng; cần UAT dữ liệu thật qua Gateway.
- Migration triển khai trước code; các API cũ giữ tương thích. Migration đã áp dụng local; không reset hoặc seed lại database dùng chung.

Các invariant và constraint chi tiết nằm trong tài liệu kỹ thuật. Kết quả kiểm tra và hướng dẫn chạy ở [biên bản kiểm thử](../testing/equipment-registration.md).
