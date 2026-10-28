import 'package:flutter/material.dart';

import '../../ui/components.dart';
import 'service_report_read.dart';
import 'read_widgets.dart';
import 'command_dialog.dart';
import 'work_order_workflow.dart';
import 'workspace_repository.dart';

class LiveReportForm extends StatefulWidget {
  const LiveReportForm({super.key, required this.workflow});
  final WorkOrderWorkflow workflow;
  @override
  State<LiveReportForm> createState() => _LiveReportFormState();
}

class _LiveReportFormState extends State<LiveReportForm> {
  final _form = GlobalKey<FormState>();
  final _problem = TextEditingController(),
      _cause = TextEditingController(),
      _solution = TextEditingController(),
      _summary = TextEditingController();
  late final Object? _assignmentId;
  int _step = 0;
  String _result = 'RESOLVED';
  bool _observedDirty = false;
  bool _preview = false,
      _submitted = false,
      _allowExit = false,
      _leaving = false;
  WorkOrderWorkflow get flow => widget.workflow;
  bool get _dirty =>
      [_problem, _cause, _solution, _summary].any((c) => c.text.isNotEmpty) ||
      _result != 'RESOLVED';
  bool get _sameAssignment =>
      nested(flow.order?.data ?? {}, 'currentAssignment')['id'] ==
      _assignmentId;
  @override
  void initState() {
    super.initState();
    for (final c in [_problem, _cause, _solution, _summary]) {
      c.addListener(_onEdit);
    }
    _assignmentId = nested(flow.order!.data, 'currentAssignment')['id'];
  }

  void _onEdit() {
    final dirty = _dirty;
    if (mounted && dirty != _observedDirty) {
      setState(() => _observedDirty = dirty);
    }
  }

  @override
  void dispose() {
    for (final c in [_problem, _cause, _solution, _summary]) {
      c.dispose();
    }
    super.dispose();
  }

  Json get _body => {
    'problemDescription': _problem.text.trim(),
    if (_cause.text.trim().isNotEmpty) 'rootCause': _cause.text.trim(),
    'solution': _solution.text.trim(),
    'result': _result,
    'customerSummary': _summary.text.trim(),
  };

  Future<void> _leave() async {
    if (flow.busy || _leaving) return;
    if (!_dirty || _submitted) {
      Navigator.pop(context, true);
      return;
    }
    _leaving = true;
    try {
      final leave = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Rời báo cáo đang nhập?'),
          content: Text(
            flow.uncertain
                ? 'Kết quả gửi chưa được xác định. Nội dung đang nhập sẽ mất khi rời; ứng dụng vẫn khóa gửi lại và kiểm tra máy chủ khi mở lại công việc.'
                : 'Báo cáo chưa gửi. Nội dung đang nhập sẽ mất khi rời màn hình.',
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
      if (mounted && leave == true) {
        setState(() => _allowExit = true);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) Navigator.pop(context, false);
        });
      }
    } finally {
      _leaving = false;
    }
  }

  void _next() {
    if (!_form.currentState!.validate()) return;
    setState(() {
      if (_step < 2) {
        _step++;
      } else {
        _preview = true;
      }
    });
  }

  Future<void> _submit() async {
    if (!_sameAssignment || !flow.can('complete')) return;
    final success = await flow.execute('complete', body: _body);
    if (mounted && success) {
      setState(() {
        _submitted = true;
        _allowExit = true;
      });
    }
  }

  Future<void> _check() async {
    final success = await flow.checkOutcome();
    if (mounted && success && flow.order?.status == 'COMPLETED') {
      setState(() {
        _submitted = true;
        _allowExit = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: flow,
    builder: (context, _) => PopScope(
      canPop: !flow.busy && (_submitted || !_dirty || _allowExit),
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _leave();
      },
      child: ReadPage(
        title: _submitted ? 'Báo cáo đã ghi nhận' : 'Service Report',
        actions: [
          IconButton(
            tooltip: 'Đóng báo cáo',
            onPressed: flow.busy ? null : _leave,
            icon: const Icon(Icons.close),
          ),
        ],
        bottom: _submitted
            ? FilledButton(
                key: const Key('report-done'),
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Xem công việc và báo cáo'),
              )
            : _bottom(),
        child: ReadList(
          children: _submitted
              ? [
                  const Notice(
                    'Máy chủ đã ghi nhận báo cáo và công việc đã hoàn thành.',
                  ),
                  DataCard(
                    flow.order!.number,
                    fields: {
                      'Trạng thái': label(flow.order!.status),
                      'Hoàn thành lúc': dateText(
                        flow.order!.data['completedAt'],
                        time: true,
                      ),
                    },
                  ),
                  ServiceReportRead(
                    repo: flow.repo,
                    workOrderId: flow.id,
                    revision: flow.revision,
                  ),
                  OutlinedButton(
                    onPressed: () =>
                        Navigator.of(context)
                            .popUntil((route) => route.isFirst),
                    child: const Text('Về màn hình chính'),
                  ),
                ]
              : [
                  PageHeading(
                    flow.order?.number ?? flow.id,
                    subtitle: 'Chẩn đoán nội bộ và tóm tắt cho khách hàng được lưu riêng.',
                  ),
                  if (flow.notice != null) Notice(flow.notice!),
                  if (!_sameAssignment)
                    const Notice(
                      'Phân công đã thay đổi. Giữ lại bản đang nhập để đối chiếu; không gửi báo cáo cho phân công mới.',
                    ),
                  if (flow.loadError != null)
                    Notice(flow.loadError!.userMessage),
                  if (_sameAssignment && flow.can('resume'))
                    OutlinedButton(
                      key: const Key('report-resume'),
                      onPressed: () => showDialog<void>(
                        context: context,
                        barrierDismissible: false,
                        builder: (_) => WorkOrderCommandDialog(
                          workflow: flow,
                          action: 'resume',
                        ),
                      ),
                      child: const Text(
                        'Tiếp tục công việc trước khi gửi báo cáo',
                      ),
                    ),
                  if (flow.order?.terminal ?? false) ...[
                    const Notice(
                      'Công việc đã kết thúc trên máy chủ. Bản đang nhập chưa được gửi lại.',
                    ),
                    if (flow.order?.status == 'COMPLETED')
                      ServiceReportRead(
                        repo: flow.repo,
                        workOrderId: flow.id,
                        revision: flow.revision,
                      ),
                  ],
                  if (_preview) ...[
                    const Pill('Xem trước · Chưa gửi'),
                    DataCard(
                      'Chẩn đoán nội bộ',
                      fields: {
                        'Vấn đề': _problem.text.trim(),
                        'Nguyên nhân': _cause.text.trim(),
                        'Giải pháp': _solution.text.trim(),
                      },
                    ),
                    DataCard(
                      'Kết quả dành cho khách hàng',
                      fields: {
                        'Kết quả': label(_result),
                        'Tóm tắt cho khách hàng': _summary.text.trim(),
                      },
                    ),
                  ] else
                    Form(
                      key: _form,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          ChoicePills(
                            labels: const [
                              '1. Chẩn đoán',
                              '2. Xử lý',
                              '3. Kết quả',
                            ],
                            selected: _step,
                            onSelected: (i) {
                              if (i < _step) {
                                setState(() => _step = i);
                              }
                            },
                          ),
                          const SizedBox(height: 20),
                          if (_step == 0) ...[
                            _field(
                              'report-problem',
                              _problem,
                              'Vấn đề / hiện trạng *',
                              5000,
                              required: true,
                            ),
                            const SizedBox(height: 16),
                            _field(
                              'report-cause',
                              _cause,
                              'Nguyên nhân nội bộ (tùy chọn)',
                              5000,
                            ),
                          ],
                          if (_step == 1)
                            _field(
                              'report-solution',
                              _solution,
                              'Giải pháp đã thực hiện *',
                              5000,
                              required: true,
                            ),
                          if (_step == 2) ...[
                            DropdownButtonFormField<String>(
                              key: const Key('report-result'),
                              initialValue: _result,
                              isExpanded: true,
                              decoration: const InputDecoration(
                                labelText: 'Kết quả *',
                              ),
                              items: [
                                for (final r in [
                                  'RESOLVED',
                                  'PARTIALLY_RESOLVED',
                                  'UNRESOLVED',
                                ])
                                  DropdownMenuItem(
                                    value: r,
                                    child: Text(label(r)),
                                  ),
                              ],
                              onChanged: flow.busy || flow.uncertain
                                  ? null
                                  : (v) => setState(() => _result = v!),
                            ),
                            const SizedBox(height: 16),
                            _field(
                              'report-summary',
                              _summary,
                              'Tóm tắt gửi khách hàng *',
                              2000,
                              required: true,
                            ),
                            const Text(
                              'Khách hàng sẽ đọc phần tóm tắt này; không đưa chẩn đoán nội bộ vào đây.',
                            ),
                          ],
                        ],
                      ),
                    ),
                ],
        ),
      ),
    ),
  );
  Widget _field(
    String key,
    TextEditingController controller,
    String title,
    int limit, {
    bool required = false,
  }) => TextFormField(
    key: Key(key),
    controller: controller,
    enabled: !flow.busy && !flow.uncertain,
    minLines: 4,
    maxLines: 8,
    maxLength: limit,
    decoration: InputDecoration(labelText: title, alignLabelWithHint: true),
    validator: (v) {
      if (required && (v == null || v.trim().isEmpty)) {
        return 'Vui lòng nhập nội dung bắt buộc.';
      }
      if ((v?.trim().length ?? 0) > limit) return 'Tối đa $limit ký tự.';
      return null;
    },
  );
  Widget _bottom() => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      if (flow.busy)
        const Padding(
          padding: EdgeInsets.only(bottom: 8),
          child: LinearProgressIndicator(),
        ),
      Row(
        children: [
          if (_step > 0 || _preview) ...[
            Expanded(
              child: OutlinedButton(
                onPressed: flow.busy
                    ? null
                    : () => setState(() {
                        if (_preview) {
                          _preview = false;
                        } else {
                          _step--;
                        }
                      }),
                child: const Text('Quay lại'),
              ),
            ),
            const SizedBox(width: 12),
          ],
          Expanded(
            child: flow.uncertain && !flow.busy
                ? FilledButton(
                    key: const Key('report-check'),
                    onPressed: flow.busy ? null : _check,
                    child: const Text('Kiểm tra kết quả'),
                  )
                : FilledButton(
                    key: Key(_preview ? 'report-submit' : 'report-next'),
                    onPressed: flow.busy
                        ? null
                        : _preview
                        ? (_sameAssignment && flow.can('complete')
                              ? _submit
                              : null)
                        : _next,
                    child: Text(
                      _preview
                          ? 'Gửi báo cáo và hoàn thành'
                          : _step < 2
                          ? 'Tiếp tục'
                          : 'Xem trước báo cáo',
                    ),
                  ),
          ),
        ],
      ),
    ],
  );
}
