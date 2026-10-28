import 'package:flutter/material.dart';

import 'work_order_workflow.dart';
import 'workspace_repository.dart';

class WorkOrderCommandDialog extends StatefulWidget {
  const WorkOrderCommandDialog({
    super.key,
    required this.workflow,
    required this.action,
  });
  final WorkOrderWorkflow workflow;
  final String action;
  @override
  State<WorkOrderCommandDialog> createState() => _WorkOrderCommandDialogState();
}

class _WorkOrderCommandDialogState extends State<WorkOrderCommandDialog> {
  final _form = GlobalKey<FormState>(), _input = TextEditingController();
  bool get _needsText => ['reject', 'hold', 'logs'].contains(widget.action);
  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (!_form.currentState!.validate()) return;
    final success = await widget.workflow.execute(
      widget.action,
      body: _needsText
          ? {widget.action == 'logs' ? 'note' : 'reason': _input.text.trim()}
          : {},
    );
    if (success && mounted) Navigator.pop(context);
  }

  Future<void> _check() async {
    final success = await widget.workflow.checkOutcome();
    if (success && mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.workflow,
    builder: (context, _) {
      final f = widget.workflow;
      return PopScope(
        canPop: !f.busy,
        child: AlertDialog(
          scrollable: true,
          title: Text(commandLabels[widget.action]!),
          content: Form(
            key: _form,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(f.order?.number ?? f.id),
                const SizedBox(height: 12),
                Text(
                  'Trạng thái: ${label(f.order?.status ?? 'Chưa đọc được')}',
                ),
                const SizedBox(height: 12),
                if (_needsText)
                  TextFormField(
                    key: const Key('command-text'),
                    controller: _input,
                    enabled: !f.busy && !f.uncertain,
                    minLines: 3,
                    maxLines: 6,
                    maxLength: 2000,
                    decoration: InputDecoration(
                      labelText: widget.action == 'logs'
                          ? 'Ghi chú nội bộ'
                          : 'Lý do bắt buộc',
                    ),
                    validator: (v) => v == null || v.trim().isEmpty
                        ? 'Vui lòng nhập nội dung.'
                        : v.trim().length > 2000
                        ? 'Tối đa 2000 ký tự.'
                        : null,
                  )
                else
                  const Text('Xác nhận cập nhật công việc trên máy chủ?'),
                if (f.notice != null) ...[
                  const SizedBox(height: 12),
                  Text(f.notice!),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: f.busy ? null : () => Navigator.pop(context),
              child: const Text('Đóng'),
            ),
            if (f.uncertain && !f.busy)
              FilledButton(
                onPressed: f.busy ? null : _check,
                child: const Text('Kiểm tra kết quả'),
              )
            else
              FilledButton(
                key: const Key('confirm-command'),
                onPressed:
                    f.busy ||
                        !(widget.action == 'logs'
                            ? f.canNote
                            : f.can(widget.action))
                    ? null
                    : _send,
                child: Text(f.busy ? 'Đang gửi…' : 'Xác nhận'),
              ),
          ],
        ),
      );
    },
  );
}
