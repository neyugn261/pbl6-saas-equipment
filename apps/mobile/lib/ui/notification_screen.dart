import 'package:flutter/material.dart';

import 'components.dart';
import 'job_detail_screen.dart';
import 'preview_data.dart';
import 'theme.dart';

class NotificationScreen extends StatefulWidget {
  const NotificationScreen({super.key});
  @override
  State<NotificationScreen> createState() => _NotificationScreenState();
}

class _NotificationScreenState extends State<NotificationScreen> {
  int _tab = 0;
  @override
  Widget build(BuildContext context) {
    final items = [
      (
        'Công việc mới dành cho bạn',
        'Điều phối đã giao kiểm tra áp suất máy nén khí.',
        '10 phút trước',
        Icons.work_outline_rounded,
        AppColors.teal,
        1,
        true,
      ),
      (
        'Công việc đang tạm dừng',
        'Theo dõi phương án thực hiện cùng điều phối.',
        '1 giờ trước',
        Icons.pause_circle_outline_rounded,
        AppColors.peach,
        2,
        true,
      ),
      (
        'Báo cáo đã được ghi nhận',
        'Xem lại kết quả và nội dung bàn giao.',
        'Hôm qua',
        Icons.description_outlined,
        AppColors.violet,
        5,
        false,
      ),
      (
        'Cập nhật công việc đã hủy',
        'Thông tin minh họa về thay đổi công việc.',
        '25/10/2026',
        Icons.event_busy_outlined,
        AppColors.berry,
        7,
        false,
      ),
    ];
    return UiPage(
      title: 'Thông báo',
      child: ListView(
        padding: const EdgeInsets.all(22),
        children: [
          const PageHeading(
            'Luôn nắm bắt\nđiều quan trọng.',
            subtitle: 'Hộp thư công việc · Giao diện M3',
          ),
          const SizedBox(height: 24),
          ChoicePills(
            labels: const ['Tất cả', 'Chưa đọc'],
            selected: _tab,
            onSelected: (i) => setState(() => _tab = i),
          ),
          const SizedBox(height: 24),
          for (final (title, body, time, icon, color, job, unread)
              in items.where((i) => _tab == 0 || i.$7))
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: SoftCard(
                color: unread ? AppColors.paper : Colors.white,
                onTap: () => openPage(
                  context,
                  JobDetailScreen(job: PreviewData.jobs[job]),
                ),
                padding: const EdgeInsets.all(17),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CircleAvatar(
                      backgroundColor: color.withValues(alpha: .15),
                      child: Icon(icon, color: color, size: 20),
                    ),
                    const SizedBox(width: 13),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  title,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                              if (unread)
                                const Padding(
                                  padding: EdgeInsets.only(left: 6),
                                  child: Icon(
                                    Icons.circle,
                                    size: 6,
                                    color: AppColors.violet,
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 7),
                          Text(
                            body,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          const SizedBox(height: 9),
                          Text(
                            time,
                            style: const TextStyle(
                              fontSize: 10,
                              color: AppColors.muted,
                            ),
                          ),
                          TextButton(
                            onPressed: () =>
                                previewAction(context, 'Đánh dấu đã đọc'),
                            child: const Text(
                              'Đánh dấu đã đọc',
                              style: TextStyle(fontSize: 11),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 16),
          const Text(
            'Nội dung minh họa. Loại thông báo và người nhận sẽ theo chính sách nghiệp vụ được duyệt.',
            style: TextStyle(fontSize: 11, color: AppColors.muted),
          ),
          // TODO(mobile-notification): confirm public route/recipient matrix with Huy
          // and Nguyen. Reauthorize deep links, GET inbox/count, PATCH one read flag.
        ],
      ),
    );
  }
}
