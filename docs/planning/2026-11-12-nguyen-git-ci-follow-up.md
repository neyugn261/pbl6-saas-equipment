# Bàn giao Git và CI — phần Nguyên

1. Push nhánh `fix/nguyen-web-integration-20261112` và mở PR vào `develop`. Đối chiếu mục **Files changed** với phạm vi Web và tệp bàn giao này.
2. Mở tab **Checks** của PR. Workflow `CI` chạy khi mở PR và có ba job: kiểm tra mã nguồn, kiểm thử database và Gateway, kiểm tra ứng dụng Android.
3. Nếu job thất bại, mở job tương ứng và đọc lỗi đầu tiên. Nếu GitHub báo job chưa bắt đầu vì thanh toán hoặc ngân sách, chủ repo kiểm tra **Billing and licensing** của tài khoản sở hữu repo. Billing là lỗi đã ghi nhận ở lần kiểm tra trước. Trạng thái run mới cần được xác nhận từ log trên GitHub.
4. Sau khi xử lý nguyên nhân, dùng **Re-run jobs** trên run của PR và ghi lại kết quả cho commit mới nhất. Theo quy trình nhóm, PR cần một người khác duyệt và các kiểm tra bắt buộc phải đạt trước khi merge.
