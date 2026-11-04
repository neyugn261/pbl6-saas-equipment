import 'package:flutter/material.dart';

import '../../core/api/api_exception.dart';
import 'workspace_repository.dart';

/// Reads immutable WO instructions and saves versioned results; never changes stock.
class ChecklistPanel extends StatefulWidget {
  const ChecklistPanel({
    super.key,
    required this.repo,
    required this.orderId,
    this.onSaved,
  });
  final WorkspaceRepository repo;
  final String orderId;
  final VoidCallback? onSaved;
  @override
  State<ChecklistPanel> createState() => _ChecklistPanelState();
}

class _ChecklistPanelState extends State<ChecklistPanel> {
  Json? _data;
  List<Json> _results = [];
  bool _busy = false, _dirty = false;
  String? _error;
  int _epoch = 0;
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(ChecklistPanel old) {
    super.didUpdateWidget(old);
    if (old.repo != widget.repo || old.orderId != widget.orderId) {
      _epoch++;
      _data = null;
      _results = [];
      _dirty = false;
      _load();
    }
  }

  @override
  void dispose() {
    _epoch++;
    super.dispose();
  }

  Future<void> _load() async {
    final epoch = ++_epoch;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final data = await widget.repo.get(
        '${WorkspaceRepository.wo}/work-orders/${widget.orderId}/checklist',
      );
      rows(data['items']);
      final results = rows(data['results']);
      if (data['version'] is! int || data['canEdit'] is! bool) {
        throw const ApiException('INVALID_RESPONSE');
      }
      if (!mounted || epoch != _epoch) return;
      setState(() {
        _data = data;
        _results = results.map((r) => Map<String, dynamic>.from(r)).toList();
        _dirty = false;
      });
    } catch (e) {
      if (mounted && epoch == _epoch) {
        setState(
          () => _error = e is ApiException
              ? e.userMessage
              : 'Không tải được checklist.',
        );
      }
    } finally {
      if (mounted && epoch == _epoch) setState(() => _busy = false);
    }
  }

  Json _result(String id) => _results.firstWhere(
    (r) => r['itemId'] == id,
    orElse: () => {'itemId': id, 'status': 'NOT_DONE', 'note': ''},
  );
  void _update(String id, String key, String value) {
    setState(() {
      final next = Map<String, dynamic>.from(_result(id));
      next[key] = value;
      _results = [..._results.where((r) => r['itemId'] != id), next];
      _dirty = true;
    });
  }

  Future<void> _save() async {
    if (_busy || _data?['canEdit'] != true) return;
    final epoch = ++_epoch;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final response = object(
        await widget.repo.post(widget.orderId, 'checklist', {
          'expectedVersion': _data!['version'],
          'results': _results,
        }),
      );
      rows(response['items']);
      final results = rows(response['results']);
      if (!mounted || epoch != _epoch) return;
      setState(() {
        _data = response;
        _results = results;
        _dirty = false;
      });
      widget.onSaved?.call();
    } catch (e) {
      if (mounted && epoch == _epoch) {
        setState(
          () => _error =
              '${e is ApiException ? e.userMessage : 'Chưa xác nhận được kết quả lưu.'} Kiểm tra kết quả trên máy chủ trước khi gửi lại.',
        );
      }
    } finally {
      if (mounted && epoch == _epoch) setState(() => _busy = false);
    }
  }

  Future<void> _reload() async {
    if (_dirty) {
      final discard = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Tải lại kết quả?'),
          content: const Text(
            'Thay đổi chưa lưu sẽ được thay bằng kết quả trên máy chủ.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Giữ thay đổi'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Tải lại'),
            ),
          ],
        ),
      );
      if (discard != true || !mounted) return;
    }
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final items = _data == null ? <Json>[] : rows(_data!['items']);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Checklist thực hiện',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            if (_busy) const LinearProgressIndicator(),
            if (_error != null)
              Text(
                _error!,
                key: const Key('checklist-error'),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            if (_data != null && items.isEmpty)
              const Text('Công việc này không có checklist bắt buộc.'),
            for (final item in items)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      '${item['title']}${item['required'] == true ? ' *' : ''}',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text('${item['action']} · ${item['instructions']}'),
                    DropdownButtonFormField<String>(
                      key: ValueKey(
                        '${_data!['version']}:${item['id']}:status',
                      ),
                      initialValue:
                          _result(item['id'] as String)['status'] as String,
                      decoration: const InputDecoration(labelText: 'Kết quả'),
                      items: [
                        const DropdownMenuItem(
                          value: 'NOT_DONE',
                          child: Text('Chưa thực hiện'),
                        ),
                        const DropdownMenuItem(
                          value: 'DONE',
                          child: Text('Đã thực hiện'),
                        ),
                        if (item['allowNotApplicable'] == true)
                          const DropdownMenuItem(
                            value: 'NOT_APPLICABLE',
                            child: Text('Không áp dụng'),
                          ),
                      ],
                      onChanged: _busy || _data!['canEdit'] != true
                          ? null
                          : (v) {
                              if (v != null) {
                                _update(item['id'] as String, 'status', v);
                              }
                            },
                    ),
                    TextFormField(
                      key: ValueKey('${_data!['version']}:${item['id']}:note'),
                      initialValue:
                          _result(item['id'] as String)['note'] as String,
                      maxLength: 2000,
                      enabled: !_busy && _data!['canEdit'] == true,
                      decoration: const InputDecoration(
                        labelText: 'Ghi chú nội bộ / lý do không áp dụng',
                      ),
                      onChanged: (v) =>
                          _update(item['id'] as String, 'note', v),
                    ),
                  ],
                ),
              ),
            if (items.isNotEmpty && _data?['canEdit'] == true)
              FilledButton(
                key: const Key('checklist-save'),
                onPressed: _busy || !_dirty ? null : _save,
                child: const Text('Lưu kết quả checklist'),
              ),
            TextButton(
              key: const Key('checklist-reload'),
              onPressed: _busy ? null : _reload,
              child: const Text('Tải lại kết quả từ máy chủ'),
            ),
            if (items.isNotEmpty)
              const Text(
                'Lưu đầy đủ các mục bắt buộc trước khi gửi báo cáo. Checklist không tự xuất phụ tùng.',
              ),
          ],
        ),
      ),
    );
  }
}
