import 'package:flutter/material.dart';

import 'report_form.dart';
import 'work_order_workflow.dart';
import 'command_dialog.dart';

class WorkOrderActionBar extends StatefulWidget {
  const WorkOrderActionBar({
    super.key,
    required this.workflow,
    required this.onReportClosed,
  });
  final WorkOrderWorkflow workflow;
  final VoidCallback onReportClosed;
  @override
  State<WorkOrderActionBar> createState() => _WorkOrderActionBarState();
}

class _WorkOrderActionBarState extends State<WorkOrderActionBar> {
  bool _opening = false;
  Future<void> _command(String action) async {
    if (_opening) return;
    widget.workflow.dismissNotice();
    setState(() => _opening = true);
    try {
      if (action == 'complete') {
        final done = await Navigator.of(context).push<bool>(
          MaterialPageRoute(
            builder: (_) => LiveReportForm(workflow: widget.workflow),
          ),
        );
        if (mounted && done == true) widget.onReportClosed();
      } else {
        await showDialog<void>(
          context: context,
          barrierDismissible: false,
          builder: (_) =>
              WorkOrderCommandDialog(workflow: widget.workflow, action: action),
        );
      }
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final flow = widget.workflow, w = flow.order;
    if (w == null) return const SizedBox.shrink();
    if (flow.uncertain && !flow.busy) {
      return OutlinedButton.icon(
        key: const Key('check-outcome'),
        onPressed: flow.checkOutcome,
        icon: const Icon(Icons.sync),
        label: const Text('Kiểm tra kết quả'),
      );
    }
    if (flow.busy) {
      return const Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          SizedBox(width: 12),
          Flexible(child: Text('Đang kiểm tra / gửi thao tác…')),
        ],
      );
    }
    if (w.terminal ||
        !w.currentFor(flow.repo.user.id) ||
        flow.repo.write == null) {
      return const SizedBox.shrink();
    }
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final action in technicianTransitions.keys.where(
          (a) => w.allows(a, flow.repo.user.id),
        ))
          FilledButton(
            key: Key('wo-$action'),
            onPressed: _opening || !flow.can(action)
                ? null
                : () => _command(action),
            child: Text(commandLabels[action]!),
          ),
        OutlinedButton.icon(
          key: const Key('wo-log'),
          onPressed: _opening || !flow.canNote ? null : () => _command('logs'),
          icon: const Icon(Icons.edit_note),
          label: const Text('Ghi chú'),
        ),
      ],
    );
  }
}
