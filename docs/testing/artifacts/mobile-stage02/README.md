# Android UAT — mobile giai đoạn 2, 07/11/2026

Android API 36 nối Gateway/Identity/Notification, PostgreSQL và RabbitMQ thật
trên stack test dùng riêng. Thông báo phát sinh từ API phân công WO, sau
Identity CLI bootstrap và relay outbox; không seed hộp thư trực tiếp.

- [Badge chưa đọc trước khi mở](badge-before.png)
- [Hộp thư thật](inbox.png)
- [Chi tiết thông báo đã đọc](notice-read.png)
- [WO mở từ thông báo sau kiểm tra quyền](work-order-link.png)
- [Badge sau phân công mới và trở lại foreground](badge-foreground.png)
- [Kết quả, các kiểm tra fixture và hash APK UAT](results.json)

Không đưa credential/token hoặc runtime manifest vào artifact. Hash nhận diện
APK với cổng Gateway test, trước khi build lại bản debug mặc định.
Phạm vi, lệnh tái hiện và giới hạn: [nghiệm thu giai đoạn 2](../../mobile-stage-2.md).
