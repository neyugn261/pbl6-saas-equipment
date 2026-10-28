import 'package:flutter/material.dart';

import 'attachment_screens.dart';
import 'components.dart';
import 'equipment_screens.dart';
import 'preview_data.dart';
import 'report_screen.dart';
import 'theme.dart';

class JobDetailScreen extends StatefulWidget {
  const JobDetailScreen({super.key, required this.job});
  final JobPreview job;
  @override
  State<JobDetailScreen> createState() => _JobDetailScreenState();
}

class _JobDetailScreenState extends State<JobDetailScreen> {
  int _tab = 0;
  @override
  Widget build(BuildContext context) {
    final j = widget.job;
    return UiPage(
      title: 'Chi tiết công việc',
      bottom: _actions(context),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(22, 20, 22, 28),
        children: [
          Row(
            children: [
              Expanded(
                child: Text(j.id, style: Theme.of(context).textTheme.bodySmall),
              ),
              Pill(j.type, color: j.color),
            ],
          ),
          const SizedBox(height: 14),
          Text(j.title, style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              Pill(j.stage.label, color: j.stage.color),
              Pill(
                j.priority,
                color: j.priority == 'Khẩn cấp'
                    ? AppColors.berry
                    : const Color(0xffa87b49),
              ),
            ],
          ),
          const SizedBox(height: 22),
          SoftCard(
            color: j.color.withValues(alpha: .1),
            padding: const EdgeInsets.all(16),
            onTap: () => openPage(
              context,
              EquipmentDetailScreen(equipment: j.equipment),
            ),
            child: Row(
              children: [
                Icon(j.equipment.icon, size: 32, color: j.color),
                const SizedBox(width: 13),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        j.equipment.name,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        j.equipment.id,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.north_east_rounded, size: 18),
              ],
            ),
          ),
          const SizedBox(height: 24),
          ChoicePills(
            labels: const [
              'Tổng quan',
              'Hoạt động',
              'Báo cáo',
              'Tài liệu',
              'Phụ tùng',
            ],
            selected: _tab,
            onSelected: (i) => setState(() => _tab = i),
          ),
          const SizedBox(height: 22),
          if (_tab == 0) ...[
            Text(
              'Yêu cầu thực hiện',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 10),
            Text(
              j.description,
              style: const TextStyle(
                fontSize: 13,
                height: 1.65,
                color: AppColors.muted,
              ),
            ),
            const SectionTitle('Thông tin công việc'),
            SoftCard(
              child: Column(
                children: [
                  InfoRow(
                    Icons.calendar_today_outlined,
                    'Lịch dự kiến',
                    j.scheduledAt == null
                        ? 'Chưa xếp lịch'
                        : '${dateLabel(j.scheduledAt!)} · ${j.timeRange}',
                  ),
                  InfoRow(
                    Icons.business_outlined,
                    'Khách hàng',
                    j.equipment.customer,
                  ),
                  InfoRow(
                    Icons.location_on_outlined,
                    'Địa điểm',
                    j.equipment.site,
                  ),
                  InfoRow(
                    Icons.person_outline_rounded,
                    'Phân công',
                    j.stage.isActive
                        ? 'Bạn · Phân công hiện tại'
                        : 'Phân công đã kết thúc',
                  ),
                  InfoRow(
                    Icons.receipt_long_outlined,
                    'Nguồn công việc',
                    j.source,
                  ),
                ],
              ),
            ),
            const SectionTitle('Địa chỉ & liên hệ'),
            SoftCard(
              child: Column(
                children: [
                  InfoRow(
                    Icons.map_outlined,
                    'Địa chỉ thực hiện',
                    j.equipment.address,
                    onTap: () => previewAction(context, 'Sao chép địa chỉ'),
                  ),
                  InfoRow(
                    Icons.phone_outlined,
                    'Liên hệ tại địa điểm',
                    'Anh Minh · 0900 000 123',
                    onTap: () => previewAction(context, 'Mở trình quay số'),
                  ),
                ],
              ),
            ),
            if (j.stage == JobStage.onHold) ...[
              const SizedBox(height: 20),
              const SoftCard(
                color: AppColors.palePeach,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Lý do tạm dừng',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                    SizedBox(height: 8),
                    Text(
                      'Chờ khách hàng bố trí thời gian ngừng thiết bị để kiểm tra.',
                      style: TextStyle(fontSize: 13),
                    ),
                  ],
                ),
              ),
            ],
            if (j.stage == JobStage.cancelled) ...[
              const SizedBox(height: 20),
              const SoftCard(
                color: AppColors.paleBerry,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Công việc đã được hủy',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                    SizedBox(height: 8),
                    Text(
                      'Điều phối đã cập nhật phương án xử lý. Lịch sử công việc được giữ lại.',
                      style: TextStyle(fontSize: 13),
                    ),
                  ],
                ),
              ),
            ],
          ],
          if (_tab == 1) ...[
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Nhật ký công việc',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                if (j.stage.isActive)
                  TextButton.icon(
                    onPressed: () => _note(context),
                    icon: const Icon(Icons.add_rounded, size: 18),
                    label: const Text('Ghi chú'),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            if (j.stage == JobStage.completed)
              const _JobEvent(
                '14:30',
                'Đã hoàn thành công việc',
                'Báo cáo kỹ thuật đã được ghi nhận.',
                Icons.task_alt_rounded,
                AppColors.teal,
              ),
            if (j.stage == JobStage.onHold)
              const _JobEvent(
                '13:40',
                'Tạm dừng thực hiện',
                'Chờ khách hàng bố trí thời gian kiểm tra.',
                Icons.pause_circle_outline_rounded,
                AppColors.peach,
              ),
            if ([
              JobStage.inProgress,
              JobStage.onHold,
              JobStage.completed,
            ].contains(j.stage)) ...[
              const _JobEvent(
                '09:15',
                'Ghi chú hiện trường',
                'Đã kiểm tra kết nối và xác định khu vực cần xử lý.',
                Icons.notes_rounded,
                AppColors.peach,
              ),
              const _JobEvent(
                '08:30',
                'Bắt đầu thực hiện',
                'Bạn · Công việc đang được xử lý.',
                Icons.play_arrow_rounded,
                AppColors.teal,
              ),
            ],
            if (j.stage != JobStage.assigned && j.stage != JobStage.cancelled)
              const _JobEvent(
                '08:05',
                'Tiếp nhận công việc',
                'Bạn · Đã xác nhận phân công.',
                Icons.check_rounded,
                AppColors.violet,
              ),
            const _JobEvent(
              '07:45',
              'Được phân công',
              'Bộ phận điều phối đã giao công việc.',
              Icons.person_outline_rounded,
              AppColors.violet,
            ),
            const _JobEvent(
              '07:30',
              'Tạo Work Order',
              'Công việc được tiếp nhận từ nguồn yêu cầu.',
              Icons.receipt_long_outlined,
              AppColors.muted,
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: () =>
                  openPage(context, _AssignmentHistoryScreen(job: j)),
              child: const Text('Xem lịch sử phân công'),
            ),
          ],
          if (_tab == 2) ...[
            if (j.stage == JobStage.completed)
              SoftCard(
                color: AppColors.paleTeal,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.description_outlined,
                      color: AppColors.teal,
                      size: 36,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Báo cáo đã nộp',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      j.result,
                      style: const TextStyle(color: AppColors.teal),
                    ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: () =>
                          openPage(context, ReportReadScreen(job: j)),
                      child: const Text('Xem báo cáo'),
                    ),
                  ],
                ),
              )
            else
              StatePanel(
                title: 'Ghi lại kết quả kỹ thuật',
                message: j.stage == JobStage.inProgress
                    ? 'Mô tả chẩn đoán, giải pháp và nội dung bàn giao cho khách.'
                    : 'Báo cáo được lập khi công việc đang thực hiện.',
                icon: Icons.description_outlined,
                action: j.stage == JobStage.inProgress
                    ? 'Lập Service Report'
                    : null,
                onAction: () => openPage(context, ReportFormScreen(job: j)),
              ),
          ],
          if (_tab == 3) AttachmentSection(job: j),
          if (_tab == 4) const PartsSection(),
        ],
      ),
    );
  }

  void _note(BuildContext context) => reasonSheet(
    context,
    title: 'Thêm ghi chú',
    label: 'Ghi nhận nội dung nội bộ liên quan đến công việc.',
  );

  Widget _actions(BuildContext context) {
    final j = widget.job;
    // TODO(mobile-workflow): drive actions from server allowedActions and recheck
    // current assignment. No mutation or optimistic fixture transition here.
    return switch (j.stage) {
      JobStage.assigned => Row(
        children: [
          Expanded(
            child: OutlinedButton(
              onPressed: () => reasonSheet(
                context,
                title: 'Từ chối công việc',
                label: 'Cho điều phối biết lý do bạn chưa thể tiếp nhận.',
              ),
              child: const Text('Từ chối'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: FilledButton(
              onPressed: () => previewAction(context, 'Nhận việc'),
              child: const Text('Nhận việc'),
            ),
          ),
        ],
      ),
      JobStage.accepted => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          FilledButton.icon(
            onPressed: () => previewAction(context, 'Bắt đầu di chuyển'),
            icon: const Icon(Icons.directions_walk_rounded, size: 19),
            label: const Text('Bắt đầu di chuyển'),
          ),
          TextButton(
            onPressed: () => previewAction(context, 'Bắt đầu công việc'),
            child: const Text('Bắt đầu công việc ngay'),
          ),
        ],
      ),
      JobStage.travelling => FilledButton.icon(
        onPressed: () => previewAction(context, 'Bắt đầu công việc'),
        icon: const Icon(Icons.play_arrow_rounded),
        label: const Text('Bắt đầu công việc'),
      ),
      JobStage.inProgress => Row(
        children: [
          RoundIcon(
            Icons.pause_rounded,
            label: 'Tạm dừng công việc',
            onTap: () => reasonSheet(
              context,
              title: 'Tạm dừng công việc',
              label: 'Lý do tạm dừng giúp điều phối theo dõi tiến độ.',
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: FilledButton.icon(
              key: const Key('open-report'),
              onPressed: () => openPage(context, ReportFormScreen(job: j)),
              icon: const Icon(Icons.task_alt_rounded, size: 19),
              label: const Text('Hoàn thành công việc'),
            ),
          ),
        ],
      ),
      JobStage.onHold => FilledButton.icon(
        onPressed: () => previewAction(context, 'Tiếp tục công việc'),
        icon: const Icon(Icons.play_arrow_rounded),
        label: const Text('Tiếp tục công việc'),
      ),
      JobStage.completed => OutlinedButton.icon(
        onPressed: () => openPage(context, ReportReadScreen(job: j)),
        icon: const Icon(Icons.description_outlined, size: 18),
        label: const Text('Xem báo cáo đã nộp'),
      ),
      JobStage.cancelled => const Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.lock_outline_rounded, size: 16, color: AppColors.muted),
          SizedBox(width: 8),
          Flexible(
            child: Text(
              'Chỉ xem · Công việc đã hủy',
              style: TextStyle(color: AppColors.muted, fontSize: 12),
            ),
          ),
        ],
      ),
    };
  }
}

class _JobEvent extends StatelessWidget {
  const _JobEvent(
    this.time,
    this.title,
    this.description,
    this.icon,
    this.color,
  );
  final String time, title, description;
  final IconData icon;
  final Color color;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 25),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CircleAvatar(
          radius: 18,
          backgroundColor: color.withValues(alpha: .13),
          child: Icon(icon, size: 18, color: color),
        ),
        const SizedBox(width: 13),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(time, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 4),
              Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 6),
              Text(description, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ],
    ),
  );
}

class _AssignmentHistoryScreen extends StatelessWidget {
  const _AssignmentHistoryScreen({required this.job});
  final JobPreview job;
  @override
  Widget build(BuildContext context) => UiPage(
    title: 'Lịch sử phân công',
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        PageHeading('Đúng người,\nđúng công việc.', eyebrow: job.id),
        const SizedBox(height: 28),
        SoftCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Pill(
                job.stage.isActive
                    ? 'Phân công hiện tại'
                    : 'Phân công đã kết thúc',
                color: AppColors.violet,
              ),
              const SizedBox(height: 16),
              const InfoRow(Icons.person_outline, 'Kỹ thuật viên', 'Bạn'),
              const InfoRow(
                Icons.event_outlined,
                'Thời điểm phân công',
                '28/10/2026 · 07:45',
              ),
              const InfoRow(
                Icons.support_agent_rounded,
                'Người phân công',
                'Bộ phận điều phối',
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        const Text(
          'Các lần thay đổi phân công sẽ được lưu để đối soát công việc.',
          style: TextStyle(fontSize: 12, color: AppColors.muted),
        ),
      ],
    ),
  );
}
