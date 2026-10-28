import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'components.dart';
import 'equipment_screens.dart';
import 'job_detail_screen.dart';
import 'notification_screen.dart';
import 'preview_data.dart';
import 'theme.dart';

class HomeScreen extends StatelessWidget {
  // TODO(mobile-dashboard): exact scoped totals, current technician profile and
  // bounded attention preview from API; never count only a fetched first page.
  const HomeScreen({
    super.key,
    required this.name,
    required this.onJobs,
    required this.onSchedule,
    required this.onEquipment,
  });
  final String name;
  final ValueChanged<JobStage?> onJobs;
  final VoidCallback onSchedule, onEquipment;

  @override
  Widget build(BuildContext context) {
    final active = PreviewData.jobs.where((j) => j.stage.isActive).toList();
    return ListView(
      key: const PageStorageKey('home-scroll'),
      padding: const EdgeInsets.fromLTRB(22, 16, 22, 28),
      children: [
        Row(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: const BoxDecoration(
                color: AppColors.palePeach,
                shape: BoxShape.circle,
              ),
              child: Center(
                child: Text(
                  name.trim().isEmpty
                      ? 'K'
                      : name.trim().characters.first.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 23,
                    color: AppColors.berry,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Xin chào, $name',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 3),
                  const PreviewTag(),
                ],
              ),
            ),
            RoundIcon(
              Icons.search_rounded,
              label: 'Tìm công việc',
              onTap: () => onJobs(null),
            ),
            RoundIcon(
              Icons.notifications_none_rounded,
              label: 'Thông báo',
              badge: true,
              onTap: () => openPage(context, const NotificationScreen()),
            ),
          ],
        ),
        const SizedBox(height: 26),
        const PageHeading('Hôm nay của bạn', eyebrow: 'THỨ TƯ, 28 THÁNG 10'),
        const SizedBox(height: 20),
        SoftCard(
          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 13),
          child: Row(
            children: [
              const CircleAvatar(
                backgroundColor: AppColors.peach,
                child: Icon(
                  Icons.wb_sunny_outlined,
                  color: AppColors.ink,
                  size: 21,
                ),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Sẵn sàng cho hôm nay',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                    SizedBox(height: 3),
                    Text(
                      'Mỗi công việc, một sự an tâm.',
                      style: TextStyle(fontSize: 11, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        SoftCard(
          child: Column(
            children: [
              const Row(
                children: [
                  Expanded(
                    child: Text(
                      'Nhịp công việc',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  SizedBox(width: 10),
                  Text(
                    'Gần đây',
                    style: TextStyle(fontSize: 11, color: AppColors.muted),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Semantics(
                label:
                    '${active.length} công việc hiện tại, 2 hoàn thành và 1 đã hủy trong dữ liệu minh họa',
                child: SizedBox(
                  width: double.infinity,
                  height: 170,
                  child: Stack(
                    alignment: Alignment.bottomCenter,
                    children: [
                      const Positioned.fill(
                        child: CustomPaint(painter: _WorkloadPainter()),
                      ),
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              '${active.length}',
                              style: const TextStyle(
                                fontSize: 52,
                                fontWeight: FontWeight.w600,
                                letterSpacing: -2,
                                height: 1,
                              ),
                            ),
                            const SizedBox(height: 5),
                            const Text(
                              'việc cần xử lý',
                              style: TextStyle(
                                fontSize: 12,
                                color: AppColors.muted,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 18),
              const Wrap(
                alignment: WrapAlignment.center,
                spacing: 14,
                runSpacing: 10,
                children: [
                  _Legend('Hiện tại 5', AppColors.teal),
                  _Legend('Hoàn thành 2', AppColors.peach),
                  _Legend('Đã hủy 1', AppColors.berry),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        SectionTitle(
          'Cần chú ý',
          action: 'Xem tất cả',
          onTap: () => onJobs(null),
        ),
        SizedBox(
          height:
              252 +
              (MediaQuery.textScalerOf(context).scale(14) / 14 - 1).clamp(
                    0,
                    2,
                  ) *
                  150,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: 3,
            separatorBuilder: (_, _) => const SizedBox(width: 12),
            itemBuilder: (context, i) {
              final job = PreviewData.jobs[i];
              return SizedBox(
                width: 180,
                child: JobCard(
                  job: job,
                  compact: true,
                  onTap: () => openPage(context, JobDetailScreen(job: job)),
                ),
              );
            },
          ),
        ),
        const SectionTitle('Tổng quan nhanh'),
        LayoutBuilder(
          builder: (context, constraints) => Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _Metric(
                'Chờ tiếp nhận',
                '1',
                Icons.inbox_outlined,
                AppColors.violet,
                constraints.maxWidth,
                () => onJobs(JobStage.assigned),
              ),
              _Metric(
                'Đang thực hiện',
                '1',
                Icons.handyman_outlined,
                AppColors.teal,
                constraints.maxWidth,
                () => onJobs(JobStage.inProgress),
              ),
              _Metric(
                'Tạm dừng',
                '1',
                Icons.pause_circle_outline_rounded,
                AppColors.berry,
                constraints.maxWidth,
                () => onJobs(JobStage.onHold),
              ),
              _Metric(
                'Lịch hôm nay',
                '4',
                Icons.calendar_today_outlined,
                const Color(0xffad7b44),
                constraints.maxWidth,
                onSchedule,
              ),
            ],
          ),
        ),
        const SectionTitle('Tiếp tục công việc'),
        SoftCard(
          color: AppColors.paleTeal,
          onTap: () =>
              openPage(context, JobDetailScreen(job: PreviewData.jobs.first)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Pill('Đang thực hiện'),
                  Spacer(),
                  Icon(Icons.north_east_rounded, color: AppColors.teal),
                ],
              ),
              const SizedBox(height: 14),
              Text(
                PreviewData.jobs.first.title,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 6),
              Text(
                PreviewData.jobs.first.equipment.site,
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 16),
              const Row(
                children: [
                  Icon(Icons.schedule, size: 15, color: AppColors.teal),
                  SizedBox(width: 6),
                  Text(
                    '08:00 – 09:30 · Dự kiến',
                    style: TextStyle(fontSize: 12, color: AppColors.teal),
                  ),
                ],
              ),
            ],
          ),
        ),
        SectionTitle('Công cụ nhanh', action: 'Thiết bị', onTap: onEquipment),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => openPage(context, const QrPreviewScreen()),
                icon: const Icon(Icons.qr_code_scanner_rounded, size: 18),
                label: const Text('Quét QR'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: onEquipment,
                icon: const Icon(Icons.manage_search_rounded, size: 18),
                label: const Text('Tra cứu'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric(
    this.title,
    this.value,
    this.icon,
    this.color,
    this.width,
    this.onTap,
  );
  final String title, value;
  final IconData icon;
  final Color color;
  final double width;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: (width - 10) / 2,
    child: SoftCard(
      padding: const EdgeInsets.all(15),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 19, color: color),
              const Spacer(),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 25,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            title,
            style: const TextStyle(fontSize: 11, color: AppColors.muted),
          ),
        ],
      ),
    ),
  );
}

class _Legend extends StatelessWidget {
  const _Legend(this.label, this.color);
  final String label;
  final Color color;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(Icons.circle, size: 7, color: color),
      const SizedBox(width: 5),
      Text(label, style: const TextStyle(fontSize: 10, color: AppColors.muted)),
    ],
  );
}

class _WorkloadPainter extends CustomPainter {
  const _WorkloadPainter();
  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 38.0;
    final width = math.min(size.width - stroke, 276.0);
    final rect = Rect.fromLTWH((size.width - width) / 2, 20, width, width);
    var start = math.pi;
    for (final (fraction, color) in [
      (5 / 8, AppColors.teal),
      (2 / 8, AppColors.peach),
      (1 / 8, AppColors.berry),
    ]) {
      final angle = math.pi * fraction;
      canvas.drawArc(
        rect,
        start + .01,
        angle - .02,
        false,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = stroke,
      );
      start += angle;
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
