import 'package:flutter/material.dart';

import 'attachment_screens.dart';
import 'components.dart';
import 'preview_data.dart';
import 'theme.dart';

class ReportFormScreen extends StatefulWidget {
  const ReportFormScreen({super.key, required this.job});
  final JobPreview job;
  @override
  State<ReportFormScreen> createState() => _ReportFormScreenState();
}

class _ReportFormScreenState extends State<ReportFormScreen> {
  final _form = GlobalKey<FormState>();
  final _problem = TextEditingController(),
      _cause = TextEditingController(),
      _solution = TextEditingController(),
      _summary = TextEditingController();
  int _step = 0, _result = 0;
  bool _allowExit = false;
  bool get _dirty =>
      [_problem, _cause, _solution, _summary].any((c) => c.text.isNotEmpty);

  @override
  void dispose() {
    for (final c in [_problem, _cause, _solution, _summary]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _leave() async {
    if (!_dirty) {
      Navigator.pop(context);
      return;
    }
    final leave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Rời báo cáo đang nhập?'),
        content: const Text(
          'Nội dung chưa được gửi. Bạn có thể quay lại để tiếp tục hoàn thiện.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Tiếp tục nhập'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Rời báo cáo'),
          ),
        ],
      ),
    );
    if (leave == true && mounted) {
      setState(() => _allowExit = true);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) Navigator.pop(context);
      });
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_dirty || _allowExit,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop) _leave();
    },
    child: UiPage(
      title: 'Service Report',
      onBack: _leave,
      bottom: Row(
        children: [
          if (_step > 0) ...[
            Expanded(
              child: OutlinedButton(
                onPressed: () => setState(() => _step--),
                child: const Text('Quay lại'),
              ),
            ),
            const SizedBox(width: 12),
          ],
          Expanded(
            child: FilledButton(
              key: const Key('report-next'),
              onPressed: () {
                if (!_form.currentState!.validate()) return;
                if (_step < 2) {
                  setState(() => _step++);
                } else {
                  openPage(
                    context,
                    ReportReadScreen(
                      job: widget.job,
                      draft: true,
                      problem: _problem.text,
                      cause: _cause.text,
                      solution: _solution.text,
                      summary: _summary.text,
                      result: [
                        'Đã xử lý',
                        'Xử lý một phần',
                        'Chưa xử lý được',
                      ][_result],
                    ),
                  );
                }
              },
              child: Text(_step < 2 ? 'Tiếp tục' : 'Xem trước báo cáo'),
            ),
          ),
        ],
      ),
      child: ListView(
        padding: const EdgeInsets.all(22),
        children: [
          PageHeading('Ghi nhận\nkết quả công việc.', eyebrow: widget.job.id),
          const SizedBox(height: 24),
          Row(
            children: List.generate(
              3,
              (i) => Expanded(
                child: Column(
                  children: [
                    Container(
                      height: 4,
                      margin: EdgeInsets.only(right: i < 2 ? 8 : 0),
                      decoration: BoxDecoration(
                        color: i <= _step ? AppColors.teal : AppColors.line,
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      ['Chẩn đoán', 'Xử lý', 'Kết quả'][i],
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: _step == i
                            ? FontWeight.w600
                            : FontWeight.w400,
                        color: i <= _step ? AppColors.teal : AppColors.muted,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 28),
          Form(
            key: _form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_step == 0) ...[
                  Text(
                    'Bạn đã ghi nhận vấn đề gì?',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 9),
                  const Text(
                    'Mô tả biểu hiện và chẩn đoán tại hiện trường.',
                    style: TextStyle(color: AppColors.muted, fontSize: 13),
                  ),
                  const SizedBox(height: 22),
                  _field(
                    'problem-description',
                    'Mô tả vấn đề *',
                    'Triệu chứng, mã lỗi, điều kiện phát sinh…',
                    _problem,
                    5000,
                    required: true,
                  ),
                  const SizedBox(height: 20),
                  _field(
                    'root-cause',
                    'Nguyên nhân nội bộ',
                    'Kết quả chẩn đoán kỹ thuật…',
                    _cause,
                    5000,
                  ),
                ],
                if (_step == 1) ...[
                  Text(
                    'Bạn đã xử lý như thế nào?',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 9),
                  const Text(
                    'Mô tả giải pháp và kết quả kiểm tra sau xử lý.',
                    style: TextStyle(color: AppColors.muted, fontSize: 13),
                  ),
                  const SizedBox(height: 22),
                  _field(
                    'solution',
                    'Giải pháp thực hiện *',
                    'Các bước sửa chữa, hiệu chỉnh hoặc thay thế…',
                    _solution,
                    5000,
                    required: true,
                  ),
                  const SizedBox(height: 20),
                  const SoftCard(
                    color: AppColors.paleTeal,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.lightbulb_outline_rounded,
                          color: AppColors.teal,
                        ),
                        SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'Ghi nhận những gì thực tế đã làm để đội ngũ hỗ trợ dễ dàng theo dõi.',
                            style: TextStyle(fontSize: 12),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                if (_step == 2) ...[
                  Text(
                    'Kết quả & bàn giao',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 16),
                  for (var i = 0; i < 3; i++)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: SoftCard(
                        color: _result == i
                            ? AppColors.paleTeal
                            : AppColors.paper,
                        padding: const EdgeInsets.all(15),
                        onTap: () => setState(() => _result = i),
                        child: Row(
                          children: [
                            Icon(
                              _result == i
                                  ? Icons.radio_button_checked_rounded
                                  : Icons.radio_button_off_rounded,
                              color: _result == i
                                  ? AppColors.teal
                                  : AppColors.muted,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                [
                                  'Đã xử lý',
                                  'Xử lý một phần',
                                  'Chưa xử lý được',
                                ][i],
                                style: const TextStyle(
                                  fontWeight: FontWeight.w500,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  const SizedBox(height: 14),
                  _field(
                    'customer-summary',
                    'Tóm tắt dành cho khách *',
                    'Nội dung dễ hiểu để khách hàng theo dõi kết quả…',
                    _summary,
                    2000,
                    required: true,
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Nội dung này dành cho khách hàng. Giữ chẩn đoán và ghi chú nội bộ ở phần tương ứng.',
                    style: TextStyle(fontSize: 11, color: AppColors.muted),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    ),
  );

  Widget _field(
    String key,
    String label,
    String hint,
    TextEditingController controller,
    int maxLength, {
    bool required = false,
  }) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        label,
        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
      ),
      const SizedBox(height: 10),
      TextFormField(
        key: ValueKey(key),
        controller: controller,
        minLines: 4,
        maxLines: 7,
        maxLength: maxLength,
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(hintText: hint, alignLabelWithHint: true),
        validator: (v) => required && (v == null || v.trim().isEmpty)
            ? 'Vui lòng nhập nội dung.'
            : null,
      ),
    ],
  );
}

class ReportReadScreen extends StatelessWidget {
  const ReportReadScreen({
    super.key,
    required this.job,
    this.draft = false,
    this.problem,
    this.cause,
    this.solution,
    this.summary,
    this.result,
  });
  final JobPreview job;
  final bool draft;
  final String? problem, cause, solution, summary, result;
  @override
  Widget build(BuildContext context) => UiPage(
    title: draft ? 'Xem trước báo cáo' : 'Báo cáo kỹ thuật',
    bottom: draft
        ? FilledButton.icon(
            onPressed: () {
              // TODO(mobile-report): refresh WO/assignment, POST /complete once, reconcile
              // uncertain results with GET detail/report. Never simulate server completion.
              previewAction(context, 'Gửi báo cáo và hoàn thành');
            },
            icon: const Icon(Icons.task_alt_rounded, size: 18),
            label: const Text('Gửi báo cáo và hoàn thành'),
          )
        : OutlinedButton.icon(
            onPressed: () => openPage(context, UploadPreviewScreen(job: job)),
            icon: const Icon(Icons.attach_file_rounded, size: 18),
            label: const Text('Tài liệu báo cáo · M3'),
          ),
    child: ListView(
      padding: const EdgeInsets.all(22),
      children: [
        SoftCard(
          color: draft ? AppColors.palePeach : AppColors.paleTeal,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                draft ? Icons.edit_note_rounded : Icons.task_alt_rounded,
                size: 38,
                color: draft ? const Color(0xffb17a3a) : AppColors.teal,
              ),
              const SizedBox(height: 16),
              Text(
                draft ? 'Sẵn sàng để bàn giao' : 'Kết quả công việc',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              Text(
                draft
                    ? 'Bản xem trước · Chưa gửi dữ liệu'
                    : 'Báo cáo minh họa · ${dateLabel(job.scheduledAt ?? PreviewData.today)}, 14:30',
                style: const TextStyle(fontSize: 12, color: AppColors.muted),
              ),
              const SizedBox(height: 16),
              Pill(
                result ?? job.result,
                color: (result ?? job.result) == 'Đã xử lý'
                    ? AppColors.teal
                    : (result ?? job.result) == 'Xử lý một phần'
                    ? const Color(0xffa87b49)
                    : AppColors.berry,
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        Text(job.id, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 5),
        Text(job.title, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 20),
        _reportBlock(
          context,
          'Mô tả vấn đề',
          problem ?? 'Chất lượng hiển thị chưa ổn định trong quá trình vận hành thiết bị.',
        ),
        _reportBlock(
          context,
          'Nguyên nhân nội bộ',
          cause == null
              ? 'Kết nối tín hiệu cần được kiểm tra và hiệu chỉnh.'
              : cause!.trim().isEmpty
              ? 'Không ghi nhận'
              : cause!,
        ),
        _reportBlock(
          context,
          'Giải pháp thực hiện',
          solution ?? 'Đã kiểm tra kết nối, vệ sinh và hiệu chỉnh theo hướng dẫn kỹ thuật. Chạy thử sau xử lý.',
        ),
        const SectionTitle('Nội dung dành cho khách'),
        SoftCard(
          color: AppColors.paleTeal,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Icon(
                    Icons.visibility_outlined,
                    size: 16,
                    color: AppColors.teal,
                  ),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Tóm tắt bàn giao',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.teal,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                summary ?? 'Thiết bị đã được kiểm tra, hiệu chỉnh và chạy thử. Vui lòng tiếp tục theo dõi khi sử dụng.',
                style: const TextStyle(fontSize: 13, height: 1.6),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        const Text(
          'Kết quả kỹ thuật và bước xác nhận của khách hàng được theo dõi riêng.',
          style: TextStyle(color: AppColors.muted, fontSize: 11),
        ),
      ],
    ),
  );

  Widget _reportBlock(BuildContext context, String title, String text) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 9),
            Text(
              text,
              style: const TextStyle(
                fontSize: 13,
                height: 1.6,
                color: AppColors.muted,
              ),
            ),
          ],
        ),
      );
}
