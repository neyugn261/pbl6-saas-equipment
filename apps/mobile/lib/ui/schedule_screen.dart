import 'package:flutter/material.dart';

import 'components.dart';
import 'job_detail_screen.dart';
import 'preview_data.dart';
import 'theme.dart';

class ScheduleScreen extends StatefulWidget {
  // TODO(mobile-schedule): query scheduledStart in Asia/Ho_Chi_Minh intervals;
  // agree overlap semantics before treating this as an overlapping calendar.
  const ScheduleScreen({super.key});
  @override
  State<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends State<ScheduleScreen> {
  DateTime _date = PreviewData.today;
  int _mode = 0;
  bool _unscheduled = false;

  @override
  Widget build(BuildContext context) {
    final start = _date.subtract(Duration(days: _date.weekday - 1));
    final dayJobs =
        PreviewData.jobs
            .where(
              (j) =>
                  j.stage.isActive &&
                  (_unscheduled
                      ? j.scheduledAt == null
                      : j.scheduledAt != null &&
                            (_mode == 1
                                ? j.scheduledAt!.isAfter(
                                        start.subtract(
                                          const Duration(seconds: 1),
                                        ),
                                      ) &&
                                      j.scheduledAt!.isBefore(
                                        start.add(const Duration(days: 7)),
                                      )
                                : sameDay(j.scheduledAt!, _date))),
            )
            .toList()
          ..sort(
            (a, b) =>
                (a.scheduledAt ?? _date).compareTo(b.scheduledAt ?? _date),
          );
    return ListView(
      key: const PageStorageKey('schedule-scroll'),
      padding: const EdgeInsets.fromLTRB(22, 22, 22, 28),
      children: [
        const PreviewTag(),
        const SizedBox(height: 14),
        PageHeading(
          'Lịch làm việc',
          subtitle: 'Thời gian bắt đầu dự kiến của công việc.',
          action: RoundIcon(
            Icons.today_outlined,
            label: 'Về hôm nay',
            onTap: () => setState(() => _date = PreviewData.today),
          ),
        ),
        const SizedBox(height: 24),
        ChoicePills(
          labels: const ['Ngày', 'Tuần', 'Tháng'],
          selected: _mode,
          onSelected: (i) => setState(() {
            _mode = i;
            _unscheduled = false;
          }),
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: Text(
                'Tháng ${_date.month}, ${_date.year}',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
            ),
            IconButton(
              onPressed: () => _move(-1),
              tooltip: 'Trước',
              icon: const Icon(Icons.chevron_left_rounded),
            ),
            IconButton(
              onPressed: () => _move(1),
              tooltip: 'Sau',
              icon: const Icon(Icons.chevron_right_rounded),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (_mode == 2)
          _monthGrid()
        else
          Row(
            children: List.generate(7, (i) {
              final d = start.add(Duration(days: i));
              final selected = sameDay(d, _date);
              final hasJobs = PreviewData.jobs.any(
                (j) =>
                    j.stage.isActive &&
                    j.scheduledAt != null &&
                    sameDay(j.scheduledAt!, d),
              );
              return Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: Material(
                    color: selected ? AppColors.ink : Colors.white,
                    shape: StadiumBorder(
                      side: BorderSide(
                        color: selected ? AppColors.ink : AppColors.line,
                      ),
                    ),
                    child: InkWell(
                      customBorder: const StadiumBorder(),
                      onTap: () => setState(() {
                        _date = d;
                        _unscheduled = false;
                      }),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        child: Column(
                          children: [
                            Text(
                              '${d.day}',
                              style: TextStyle(
                                fontWeight: FontWeight.w600,
                                color: selected ? Colors.white : AppColors.ink,
                              ),
                            ),
                            const SizedBox(height: 5),
                            Text(
                              weekdayLabel(d.weekday),
                              style: TextStyle(
                                fontSize: 10,
                                color: selected
                                    ? Colors.white70
                                    : AppColors.muted,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Icon(
                              Icons.circle,
                              size: 4,
                              color: hasJobs
                                  ? (selected
                                        ? AppColors.peach
                                        : AppColors.teal)
                                  : AppColors.line,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              );
            }),
          ),
        const SizedBox(height: 24),
        ChoicePills(
          labels: const ['Theo lịch', 'Chưa xếp lịch'],
          selected: _unscheduled ? 1 : 0,
          onSelected: (i) => setState(() => _unscheduled = i == 1),
        ),
        SectionTitle(
          _unscheduled
              ? 'Cần xếp lịch'
              : _mode == 1
              ? 'Công việc trong tuần'
              : '${weekdayLabel(_date.weekday)} · ${dateLabel(_date)}',
        ),
        if (dayJobs.isEmpty)
          StatePanel(
            title: 'Một khoảng trống để sẵn sàng',
            message: 'Chưa có công việc bắt đầu dự kiến trong khoảng đã chọn.',
            icon: Icons.event_available_outlined,
            action: 'Về hôm nay',
            onAction: () => setState(() {
              _date = PreviewData.today;
              _unscheduled = false;
            }),
          ),
        for (final job in dayJobs) _scheduleItem(job),
        const SizedBox(height: 12),
        const Text(
          'Lịch được điều phối bởi người quản lý. Các mốc trên là thời gian dự kiến.',
          style: TextStyle(fontSize: 11, color: AppColors.muted),
        ),
      ],
    );
  }

  void _move(int direction) => setState(() {
    _date = _mode == 2
        ? DateTime(_date.year, _date.month + direction, 1)
        : _date.add(Duration(days: (_mode == 1 ? 7 : 1) * direction));
  });

  Widget _monthGrid() {
    final first = DateTime(_date.year, _date.month, 1);
    final length = DateTime(_date.year, _date.month + 1, 0).day;
    final offset = first.weekday - 1;
    return Column(
      children: [
        Row(
          children: List.generate(
            7,
            (i) => Expanded(
              child: Center(
                child: Text(
                  weekdayLabel(i + 1),
                  style: const TextStyle(color: AppColors.muted, fontSize: 11),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 10),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 7,
          ),
          itemCount: ((offset + length) / 7).ceil() * 7,
          itemBuilder: (context, i) {
            final day = i - offset + 1;
            if (day < 1 || day > length) return const SizedBox.shrink();
            final d = DateTime(_date.year, _date.month, day);
            final selected = sameDay(d, _date);
            return Center(
              child: InkWell(
                borderRadius: BorderRadius.circular(24),
                onTap: () => setState(() {
                  _date = d;
                  _unscheduled = false;
                }),
                child: Container(
                  width: 38,
                  height: 38,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: selected ? AppColors.ink : Colors.transparent,
                  ),
                  child: Text(
                    '$day',
                    style: TextStyle(
                      color: selected ? Colors.white : AppColors.ink,
                      fontSize: 12,
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _scheduleItem(JobPreview job) => Padding(
    padding: const EdgeInsets.only(bottom: 18),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 51,
          child: Padding(
            padding: const EdgeInsets.only(top: 18),
            child: Text(
              job.hour == null ? '—' : job.time,
              style: const TextStyle(fontSize: 12, color: AppColors.muted),
            ),
          ),
        ),
        Expanded(
          child: SoftCard(
            color: job.color.withValues(alpha: .15),
            padding: const EdgeInsets.all(16),
            onTap: () => openPage(context, JobDetailScreen(job: job)),
            child: Row(
              children: [
                Container(
                  width: 4,
                  height: 68,
                  decoration: BoxDecoration(
                    color: job.color,
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        job.title,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        job.equipment.name,
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppColors.muted,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        _mode == 1 && job.scheduledAt != null
                            ? '${dateLabel(job.scheduledAt!)} · ${job.timeRange}'
                            : job.timeRange,
                        style: TextStyle(
                          fontSize: 10,
                          color: job.stage.color,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}
