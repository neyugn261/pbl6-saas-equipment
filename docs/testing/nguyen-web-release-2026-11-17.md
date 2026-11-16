# Nguyên Web release — kiểm tra sau khi đồng bộ develop

Ngày kiểm tra: 17/11/2026. Nhánh `feature/nguyen-web-release`, mốc bắt đầu `49b7824` (merge `develop` tại `b870eb9`).

## API phụ thuộc

| Hạng mục | Kết quả kiểm tra source | Tích hợp Web |
| --- | --- | --- |
| HU-04, Huy | Identity có `POST /auth/change-password`, `/auth/forgot-password`, `/auth/reset-password`; Gateway chuyển tiếp `/api/identity/*`. Contract tại `docs/api/identity-password-otp.md`. | Đã thêm Web; cần E2E qua Gateway và Mailpit. Backend vẫn chờ owner Identity review. |
| KH-03, Khương | Work Order có `GET /reports/technicians`, lọc `from`, `to`, `branchId`, trả `items` và `summary`; Gateway chuyển tiếp `/api/workorders/*`. | Đã thêm KPI trong báo cáo; cần đối chiếu dữ liệu mẫu qua API thật. |
| MI-02, Minh | Chưa thấy batch handover endpoint trong Asset controller/OpenAPI hay các nhánh đã checkout. | Chưa thể gửi lô hoặc retry theo dòng một cách an toàn. |

MI-02 cần Minh chốt đường dẫn, payload dùng chung `customerId`, `customerSiteId`, ngày bàn giao thực tế và tập `equipmentId`; khóa idempotency cho cả lô và từng dòng; response theo từng thiết bị gồm trạng thái thành công/lỗi, `handoverId`, `handoverNo`, mã lỗi; quy tắc thành công một phần và retry sau timeout mà không sinh phiếu trùng. Web sẽ nối màn chọn nhiều thiết bị khi API/fixture này có trong nhánh tích hợp. Không thay thế thao tác lô bằng vòng lặp API đơn.

## Kiểm tra đã chạy

| Lệnh | Kết quả |
| --- | --- |
| Web TypeScript `tsc -b --pretty false` | PASS |
| Web ESLint | PASS sau khi loại các bản checkout local `.local`/`tmp` khỏi lint |
| Web unit `node --test test/*.test.mjs` | PASS 126/126, gồm 2 test mới về password API |
| Web Vite build | PASS |
| `docker compose --env-file infrastructure/demo.env.example -f compose.demo.yml config --quiet` | PASS, gồm cấu hình `IDENTITY_OTP_SECRET` mới |

Docker Engine của môi trường này từ chối kết nối qua `dockerDesktopLinuxEngine`. Vì vậy chưa chạy migration/seed, Web + Android cùng backend, xác nhận NG-01 cấp một phần/nhận thiếu/cách ly, NG-02 khảo sát → dự toán, hay smoke test NG-03/KPI trên dữ liệu thật. Chưa có kết quả GitHub CI của commit mới. Không coi build/unit test là nghiệm thu các luồng này.

## Điều kiện đóng việc

Chạy Compose trên Docker Engine, migrate và seed demo; nghiệm thu NG-01/NG-02 qua Gateway và Android; kiểm tra HU-04 qua Mailpit và đăng nhập lại; so KPI với dữ liệu Work Order; nhận API MI-02 để nối và kiểm tra từng dòng/retry; xác nhận CI và smoke test trên đúng commit phát hành.
