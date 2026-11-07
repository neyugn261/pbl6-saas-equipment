# Android UAT — mobile giai đoạn 0–1, 07/11/2026

Ảnh từ Android API 36 nối Gateway/Identity, database test và RabbitMQ thật.
Lượt chạy sử dụng emulator read-only riêng và fixture UUID của tool stage01;
không mock response nghiệp vụ. Mật khẩu và token test không được đưa vào artifact.

- [Checklist được khôi phục sau force-stop](checklist-restored.png)
- [Báo cáo được khôi phục sau force-stop](report-restored.png)
- [Báo cáo đã ghi nhận, WO hoàn thành](report-completed.png)
- [Kết quả và hash APK được kiểm thử](results.json)

Hash nhận diện APK với Gateway test; bản debug bàn giao sau đó được build lại
với Gateway mặc định. Hướng dẫn tái hiện, ma trận test và các giới hạn:
[nghiệm thu giai đoạn 0–1](../../mobile-stage-0-1.md).
