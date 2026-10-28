import 'package:flutter/material.dart';

import 'components.dart';
import 'job_detail_screen.dart';
import 'preview_data.dart';
import 'theme.dart';

class JobsScreen extends StatefulWidget {
  const JobsScreen({super.key, this.filter, required this.filterRevision});
  final JobStage? filter;
  final int filterRevision;
  @override
  State<JobsScreen> createState() => _JobsScreenState();
}

class _JobsScreenState extends State<JobsScreen> {
  final _search = TextEditingController();
  bool _history = false;
  JobStage? _stage;
  String _query = '', _priority = 'Tất cả', _type = 'Tất cả';

  @override
  void initState() {
    super.initState();
    _stage = widget.filter;
  }

  @override
  void didUpdateWidget(covariant JobsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.filterRevision != widget.filterRevision) {
      _stage = widget.filter;
      _history = widget.filter != null && !widget.filter!.isActive;
      _priority = 'Tất cả';
      _type = 'Tất cả';
      _query = '';
      _search.clear();
    }
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  // TODO(mobile-api): query paginated scoped WO views; personal history needs
  // ever-assigned filtering for multi-role users. This filtering is preview-only.
  @override
  Widget build(BuildContext context) {
    final jobs = PreviewData.jobs
        .where(
          (j) =>
              j.stage.isActive != _history &&
              (_stage == null || j.stage == _stage) &&
              (_priority == 'Tất cả' || j.priority == _priority) &&
              (_type == 'Tất cả' || j.type == _type) &&
              '${j.id} ${j.title}'.toLowerCase().contains(_query.toLowerCase()),
        )
        .toList();
    final stages = _history
        ? [JobStage.completed, JobStage.cancelled]
        : [
            JobStage.assigned,
            JobStage.accepted,
            JobStage.travelling,
            JobStage.inProgress,
            JobStage.onHold,
          ];
    return ListView(
      key: const PageStorageKey('jobs-scroll'),
      padding: const EdgeInsets.fromLTRB(22, 22, 22, 28),
      children: [
        const PreviewTag(),
        const SizedBox(height: 14),
        PageHeading(
          'Công việc',
          subtitle: 'Từng công việc. Từng bước vững vàng.',
          action: RoundIcon(
            Icons.tune_rounded,
            label: 'Lọc công việc',
            onTap: _filters,
          ),
        ),
        const SizedBox(height: 24),
        ChoicePills(
          labels: const ['Hiện tại', 'Lịch sử'],
          selected: _history ? 1 : 0,
          onSelected: (v) => setState(() {
            _history = v == 1;
            _stage = null;
          }),
        ),
        const SizedBox(height: 18),
        TextField(
          controller: _search,
          key: ValueKey('job-search-${widget.filterRevision}'),
          onChanged: (v) => setState(() => _query = v),
          decoration: const InputDecoration(
            hintText: 'Tìm mã hoặc tiêu đề công việc',
            prefixIcon: Icon(Icons.search_rounded, color: AppColors.muted),
          ),
        ),
        const SizedBox(height: 18),
        ChoicePills(
          labels: ['Tất cả', ...stages.map((s) => s.label)],
          selected: _stage == null ? 0 : stages.indexOf(_stage!) + 1,
          onSelected: (i) =>
              setState(() => _stage = i == 0 ? null : stages[i - 1]),
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: Text(
                '${jobs.length} công việc',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
            const Icon(Icons.sort_rounded, size: 16, color: AppColors.muted),
            const SizedBox(width: 5),
            const Text(
              'Lịch dự kiến',
              style: TextStyle(fontSize: 11, color: AppColors.muted),
            ),
          ],
        ),
        const SizedBox(height: 14),
        if (jobs.isEmpty)
          StatePanel(
            title: 'Chưa có công việc phù hợp',
            message: 'Thử tìm với từ khóa hoặc bộ lọc khác.',
            action: 'Xóa bộ lọc',
            onAction: () => setState(() {
              _stage = null;
              _priority = 'Tất cả';
              _type = 'Tất cả';
              _query = '';
              _search.clear();
            }),
          ),
        for (final job in jobs)
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: JobCard(
              job: job,
              onTap: () => openPage(context, JobDetailScreen(job: job)),
            ),
          ),
      ],
    );
  }

  Future<void> _filters() async {
    var priority = _priority, type = _type;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, update) => SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Lọc công việc',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Chọn điều bạn muốn tập trung.',
                  style: TextStyle(color: AppColors.muted),
                ),
                const SectionTitle('Mức ưu tiên'),
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: ['Tất cả', 'Bình thường', 'Cao', 'Khẩn cấp']
                      .map(
                        (p) => ChoiceChip(
                          label: Text(p),
                          selected: priority == p,
                          onSelected: (_) => update(() => priority = p),
                        ),
                      )
                      .toList(),
                ),
                const SectionTitle('Loại công việc'),
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children:
                      ['Tất cả', 'Sửa chữa', 'Bảo hành', 'Bảo trì', 'Kiểm tra']
                          .map(
                            (t) => ChoiceChip(
                              label: Text(t),
                              selected: type == t,
                              onSelected: (_) => update(() => type = t),
                            ),
                          )
                          .toList(),
                ),
                const SectionTitle('Ngày dự kiến'),
                // TODO(mobile-filters): date range picker + timezone-aware query.
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        readOnly: true,
                        onTap: () =>
                            previewAction(sheetContext, 'Chọn ngày bắt đầu'),
                        decoration: const InputDecoration(
                          hintText: 'Từ ngày',
                          suffixIcon: Icon(
                            Icons.calendar_today_outlined,
                            size: 17,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        readOnly: true,
                        onTap: () =>
                            previewAction(sheetContext, 'Chọn ngày kết thúc'),
                        decoration: const InputDecoration(
                          hintText: 'Đến ngày',
                          suffixIcon: Icon(
                            Icons.calendar_today_outlined,
                            size: 17,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 28),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => update(() {
                          priority = 'Tất cả';
                          type = 'Tất cả';
                        }),
                        child: const Text('Xóa lọc'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton(
                        onPressed: () {
                          setState(() {
                            _priority = priority;
                            _type = type;
                          });
                          Navigator.pop(sheetContext);
                        },
                        child: const Text('Áp dụng'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
