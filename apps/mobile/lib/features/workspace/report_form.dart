import 'dart:async';

import 'package:flutter/material.dart';

import '../../ui/components.dart';
import 'service_report_read.dart';
import 'read_widgets.dart';
import 'command_dialog.dart';
import 'work_order_workflow.dart';
import 'workspace_repository.dart';
import '../../core/api/api_exception.dart';

class LiveReportForm extends StatefulWidget {
  const LiveReportForm({super.key, required this.workflow});
  final WorkOrderWorkflow workflow;
  @override
  State<LiveReportForm> createState() => _LiveReportFormState();
}

class _LiveReportFormState extends State<LiveReportForm>
    with WidgetsBindingObserver {
  final _form = GlobalKey<FormState>();
  final _problem = TextEditingController(),
      _cause = TextEditingController(),
      _solution = TextEditingController(),
      _summary = TextEditingController();
  Object? _assignmentId;
  Timer? _autosave;
  bool _ready = false, _discarded = false, _draftTouched = false;
  String? _draftNotice, _draftError;
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
    WidgetsBinding.instance.addObserver(this);
    for (final c in [_problem, _cause, _solution, _summary]) {
      c.addListener(_onEdit);
    }
    _assignmentId = nested(flow.order!.data, 'currentAssignment')['id'];
    unawaited(_restoreDraft());
  }

  Future<void> _restoreDraft() async {
    try {
      final draft = await flow.repo.records.get(flow.id, 'reportDraft');
      if (!mounted) return;
      if (draft != null) {
        _draftTouched = true;
        final body = object(draft['body']);
        if (draft['assignmentId'] is! String ||
            ![
              'RESOLVED',
              'PARTIALLY_RESOLVED',
              'UNRESOLVED',
            ].contains(body['result'])) {
          throw const ApiException('WORKSPACE_STORAGE_FAILED');
        }
        _assignmentId = draft['assignmentId'];
        _problem.text = body['problemDescription'] as String;
        _cause.text = body['rootCause'] as String;
        _solution.text = body['solution'] as String;
        _summary.text = body['customerSummary'] as String;
        _result = body['result'] as String;
        _step = (draft['step'] as int).clamp(0, 2);
        _observedDirty = _dirty;
        _draftNotice =
            'Đã khôi phục bản nháp trên máy. Chưa gửi báo cáo lên máy chủ.';
      }
      setState(() {
        _ready = true;
        _draftError = null;
      });
    } catch (_) {
      if (mounted) {
        setState(
          () =>
              _draftError = const ApiException('WORKSPACE_STORAGE_FAILED')
                  .userMessage,
        );
      }
    }
  }

  Future<void> _persistDraft() async {
    _autosave?.cancel();
    if (!_ready || _submitted || _discarded || !_draftTouched) return;
    if (!_dirty) {
      await flow.repo.records.put(flow.id, 'reportDraft', null);
      return;
    }
    final snapshot = <String, dynamic>{
      'assignmentId': _assignmentId,
      'step': _step,
      'body': {
        'problemDescription': _problem.text,
        'rootCause': _cause.text,
        'solution': _solution.text,
        'customerSummary': _summary.text,
        'result': _result,
      },
    };
    await flow.repo.records.put(flow.id, 'reportDraft', snapshot);
  }

  Future<void> _saveDraft() async {
    try {
      await _persistDraft();
      if (mounted) {
        setState(() {
          _draftError = null;
          _draftNotice = 'Đã lưu nháp trên máy; chưa gửi lên máy chủ.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () =>
              _draftError = const ApiException('WORKSPACE_STORAGE_FAILED')
                  .userMessage,
        );
      }
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused) {
      unawaited(_saveDraft());
    }
  }

  void _onEdit() {
    if (!_ready) return;
    _draftTouched = true;
    _autosave?.cancel();
    _autosave = Timer(
      const Duration(milliseconds: 250),
      () => unawaited(_saveDraft()),
    );
    final dirty = _dirty;
    if (mounted && dirty != _observedDirty) {
      setState(() => _observedDirty = dirty);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _autosave?.cancel();
    // Capture the last keystroke before disposing controllers, even if the OS
    // removes the route without a user navigation callback.
    final save = _persistDraft();
    unawaited(save.catchError((Object _) {}));
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
      final leave = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Rời báo cáo đang nhập?'),
          content: Text(
            flow.uncertain
                ? 'Kết quả gửi chưa được xác định. Bản nháp và thông tin đối soát được giữ trên máy; không tự gửi lại.'
                : 'Lưu nháp trên máy để tiếp tục sau hoặc bỏ bản nháp này.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Tiếp tục nhập'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, 'save'),
              child: const Text('Rời báo cáo'),
            ),
            if (!flow.uncertain)
              TextButton(
                onPressed: () => Navigator.pop(context, 'discard'),
                child: const Text('Bỏ bản nháp'),
              ),
          ],
        ),
      );
      if (!mounted || leave == null) return;
      try {
        if (leave == 'discard') {
          _autosave?.cancel();
          await flow.repo.records.put(flow.id, 'reportDraft', null);
          _discarded = true;
        } else {
          await _persistDraft();
        }
      } catch (_) {
        if (mounted) {
          setState(
            () =>
                _draftError = const ApiException('WORKSPACE_STORAGE_FAILED')
                    .userMessage,
          );
        }
        return;
      }
      if (mounted) {
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
    if (!_ready) return;
    if (!_form.currentState!.validate()) return;
    setState(() {
      if (_step < 2) {
        _step++;
      } else {
        _preview = true;
      }
    });
    unawaited(_saveDraft());
  }

  Future<void> _submit() async {
    if (!_ready || !_sameAssignment || !flow.can('complete')) return;
    try {
      await _persistDraft();
    } catch (_) {
      if (mounted) {
        setState(
          () =>
              _draftError = const ApiException('WORKSPACE_STORAGE_FAILED')
                  .userMessage,
        );
      }
      return;
    }
    final success = await flow.execute('complete', body: _body);
    if (mounted && success) {
      _autosave?.cancel();
      setState(() {
        _submitted = true;
        _allowExit = true;
      });
      await _clearSubmittedDraft();
    }
  }

  Future<void> _check() async {
    final success = await flow.checkOutcome();
    if (mounted && success && flow.order?.status == 'COMPLETED') {
      _autosave?.cancel();
      setState(() {
        _submitted = true;
        _allowExit = true;
      });
      await _clearSubmittedDraft();
    }
  }

  Future<void> _clearSubmittedDraft() async {
    try {
      await flow.repo.records.put(flow.id, 'reportDraft', null);
    } catch (_) {
      if (mounted) {
        setState(
          () => _draftError = 'Báo cáo đã được máy chủ ghi nhận; chưa dọn được bản nháp cục bộ. Không gửi lại.',
        );
      }
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
                  if (_draftError != null) Notice(_draftError!),
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
                  if (_draftNotice != null && !_preview) Text(_draftNotice!),
                  if (_draftError != null) Notice(_draftError!),
                  if (!_ready)
                    TextButton(
                      onPressed: _restoreDraft,
                      child: const Text('Thử lại đọc bản nháp'),
                    ),
                  if (!_ready) const LinearProgressIndicator(),
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
                              onChanged:
                                  !_ready ||
                                      !_sameAssignment ||
                                      (flow.order?.terminal ?? true) ||
                                      flow.busy ||
                                      flow.uncertain
                                  ? null
                                  : (v) {
                                      setState(() => _result = v!);
                                      _onEdit();
                                    },
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
    enabled:
        _ready &&
        _sameAssignment &&
        !(flow.order?.terminal ?? true) &&
        !flow.busy &&
        !flow.uncertain,
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
                    onPressed: flow.busy || !_ready
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
