import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';

import '../../core/api/api_exception.dart';
import 'workspace_repository.dart';
import 'workspace_store.dart';

/// Immutable instructions, versioned results and a separate local draft.
class ChecklistPanel extends StatefulWidget {
  const ChecklistPanel({
    super.key,
    required this.repo,
    required this.orderId,
    this.order,
    this.onSaved,
    this.onChanged,
  });
  final WorkspaceRepository repo;
  final String orderId;
  final WorkOrder? order;
  final VoidCallback? onSaved, onChanged;
  @override
  State<ChecklistPanel> createState() => ChecklistPanelState();
}

class ChecklistPanelState extends State<ChecklistPanel>
    with WidgetsBindingObserver {
  Json? _data;
  WorkOrder? _order;
  List<Json> _results = [];
  String? _assignmentId, _error, _notice;
  int _baseVersion = 0, _epoch = 0;
  bool _busy = false, _dirty = false, _conflict = false;
  Timer? _autosave;
  String _localId = localOperationId();
  bool get busy => _busy;
  bool get dirty => _dirty;
  bool get pending => widget.repo.pendingChecklists.containsKey(widget.orderId);
  Json? get _pending => widget.repo.pendingChecklists[widget.orderId];
  WorkOrder? get _current => _order ?? widget.order;
  String? get _currentAssignment =>
      nested(_current?.data ?? {}, 'currentAssignment')['id'] as String?;
  bool get _sameAssignment =>
      _assignmentId != null && _assignmentId == _currentAssignment;
  bool get _editable =>
      _data?['canEdit'] == true &&
      _sameAssignment &&
      (_current?.currentFor(widget.repo.user.id) ?? false) &&
      !(_current?.terminal ?? true);
  bool get _canSave => _editable && !_busy && !_conflict && !pending;
  bool get _fenced =>
      _pending != null &&
      ((_data?['version'] as int? ?? -1) >
              (_pending!['expectedVersion'] as int) ||
          !_sameAssignment ||
          (_current?.terminal ?? false));

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
  }

  void _changed() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onChanged?.call();
    });
  }

  @override
  void didUpdateWidget(ChecklistPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.order != null && !identical(oldWidget.order, widget.order)) {
      _order = widget.order;
      _changed();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused) {
      unawaited(_persistSafely());
    } else if (state == AppLifecycleState.resumed && !_busy) {
      unawaited(_refreshAuthority());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _autosave?.cancel();
    if (_dirty) unawaited(_persistSafely());
    _epoch++;
    super.dispose();
  }

  Json _draft() => {
    'localId': _localId,
    'assignmentId': _assignmentId,
    'version': _baseVersion,
    'results': _results.map((r) => Map<String, dynamic>.from(r)).toList(),
  };
  Future<void> _persist() async {
    _autosave?.cancel();
    if (_dirty) {
      await widget.repo.records.put(widget.orderId, 'checklistDraft', _draft());
    }
  }

  Future<void> _persistSafely() async {
    try {
      await _persist();
    } catch (e) {
      if (mounted) setState(() => _error = _message(e));
    }
  }

  String _message(Object e) => e is ApiException
      ? e.userMessage
      : 'Không lưu được dữ liệu. Hãy thử lại.';

  void _validate(Json data) {
    rows(data['items']);
    rows(data['results']);
    if (data['version'] is! int || data['canEdit'] is! bool) {
      throw const ApiException('INVALID_RESPONSE');
    }
  }

  List<Json> _localResults(Object? value) {
    final results = rows(value);
    for (final result in results) {
      if (result['itemId'] is! String ||
          result['note'] is! String ||
          !['NOT_DONE', 'DONE', 'NOT_APPLICABLE'].contains(result['status'])) {
        throw const ApiException('WORKSPACE_STORAGE_FAILED');
      }
    }
    return results;
  }

  bool _equal(List<Json> a, List<Json> b) {
    List<Json> normalize(List<Json> values) =>
        values
            .map(
              (r) => <String, dynamic>{
                'itemId': r['itemId'],
                'status': r['status'],
                'note': r['note'],
              },
            )
            .toList()
          ..sort((x, y) => '${x['itemId']}'.compareTo('${y['itemId']}'));
    return jsonEncode(normalize(a)) == jsonEncode(normalize(b));
  }

  Future<void> _load() async {
    final epoch = ++_epoch;
    setState(() {
      _busy = true;
      _error = null;
    });
    _changed();
    try {
      await widget.repo.restoreLocal(widget.orderId);
      final order = await widget.repo.order(widget.orderId);
      final data = await widget.repo.get(
        '${WorkspaceRepository.wo}/work-orders/${widget.orderId}/checklist',
      );
      _validate(data);
      final draft = await widget.repo.records.get(
        widget.orderId,
        'checklistDraft',
      );
      final pending = _pending;
      if (!mounted || epoch != _epoch) return;
      _order = order;
      _data = data;
      if (draft != null) {
        if (draft['assignmentId'] is! String || draft['version'] is! int) {
          throw const ApiException('WORKSPACE_STORAGE_FAILED');
        }
        _results = _localResults(draft['results']);
        _localId = draft['localId'] as String? ?? localOperationId();
        _assignmentId = draft['assignmentId'] as String;
        _baseVersion = draft['version'] as int;
        _dirty = true;
        _notice =
            'Đã khôi phục bản nháp cục bộ. Chưa gửi thay đổi lên máy chủ.';
      } else if (pending != null) {
        _results = _localResults(pending['results']);
        _assignmentId = pending['assignmentId'] as String;
        _baseVersion = pending['expectedVersion'] as int;
        _dirty = true;
      } else {
        _results = rows(data['results']);
        _assignmentId =
            nested(order.data, 'currentAssignment')['id'] as String?;
        _baseVersion = data['version'] as int;
        _dirty = false;
      }
      _conflict =
          _dirty && (_baseVersion != data['version'] || !_sameAssignment);
      await _reconcile(data);
    } catch (e) {
      if (mounted && epoch == _epoch) setState(() => _error = _message(e));
    } finally {
      if (mounted && epoch == _epoch) {
        setState(() => _busy = false);
        _changed();
      }
    }
  }

  Future<void> _reconcile(Json data) async {
    final attempt = _pending;
    if (attempt == null) return;
    final version = data['version'] as int;
    if (version > (attempt['expectedVersion'] as int)) {
      final matched = _equal(rows(data['results']), rows(attempt['results']));
      await _clearIntent(attempt);
      if (matched && _equal(_results, rows(attempt['results']))) {
        await widget.repo.records.removeIf(
          widget.orderId,
          'checklistDraft',
          'localId',
          _localId,
        );
        _results = rows(data['results']);
        _baseVersion = version;
        _dirty = false;
        _conflict = false;
        _notice = 'Kết quả checklist đã có trên máy chủ. Không gửi lại.';
        widget.onSaved?.call();
      } else {
        _conflict = true;
        _notice = 'Máy chủ có kết quả khác. Bản nháp được giữ để đối chiếu; tải lại trước khi sửa tiếp.';
      }
    } else {
      _notice = 'Lần lưu trước chưa rõ kết quả. Kiểm tra máy chủ hoặc thử lại đúng lần lưu cũ; không tạo nội dung mới.';
    }
  }

  Future<void> _clearIntent(Json attempt) async {
    await widget.repo.records.removeIf(
      widget.orderId,
      'pendingChecklist',
      'operationId',
      attempt['operationId'],
    );
    if (_pending?['operationId'] == attempt['operationId']) {
      widget.repo.pendingChecklists.remove(widget.orderId);
    }
  }

  Future<void> _refreshAuthority() async {
    if (_busy) return;
    try {
      await _persist();
    } catch (e) {
      if (mounted) setState(() => _error = _message(e));
      return;
    }
    await _load();
  }

  Json _result(String id) => _results.firstWhere(
    (r) => r['itemId'] == id,
    orElse: () => {'itemId': id, 'status': 'NOT_DONE', 'note': ''},
  );
  void _update(String id, String key, String value) {
    setState(() {
      _localId = localOperationId();
      final next = Map<String, dynamic>.from(_result(id))..[key] = value;
      _results = [..._results.where((r) => r['itemId'] != id), next];
      _dirty = true;
    });
    _autosave?.cancel();
    _autosave = Timer(
      const Duration(milliseconds: 250),
      () => unawaited(_persistSafely()),
    );
    _changed();
  }

  Future<bool> save({bool retry = false}) async {
    if ((!retry && !_canSave) ||
        _busy ||
        (retry && (!_editable || _pending == null || _fenced))) {
      return false;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    _changed();
    var dispatched = false;
    Json? dispatchedAttempt;
    try {
      await _persist();
      final fresh = await widget.repo.order(widget.orderId);
      final latest = await widget.repo.get(
        '${WorkspaceRepository.wo}/work-orders/${widget.orderId}/checklist',
      );
      _validate(latest);
      _order = fresh;
      _data = latest;
      if (retry &&
          (latest['version'] as int) > (_pending!['expectedVersion'] as int)) {
        await _reconcile(latest);
        return !pending && !_dirty;
      }
      if (!_editable || (!retry && latest['version'] != _baseVersion)) {
        _conflict = true;
        throw const ApiException('CHECKLIST_VERSION_CONFLICT', status: 409);
      }
      final attempt = retry
          ? _pending!
          : <String, dynamic>{
              'assignmentId': _assignmentId,
              'operationId': localOperationId(),
              'expectedVersion': _baseVersion,
              'results': _results
                  .map((r) => Map<String, dynamic>.from(r))
                  .toList(),
            };
      await widget.repo.records.put(
        widget.orderId,
        'pendingChecklist',
        attempt,
      );
      widget.repo.pendingChecklists[widget.orderId] = attempt;
      dispatchedAttempt = attempt;
      dispatched = true;
      final response = object(
        await widget.repo.post(widget.orderId, 'checklist', {
          'expectedVersion': attempt['expectedVersion'],
          'results': attempt['results'],
        }),
      );
      _validate(response);
      if ((response['version'] as int) <= (attempt['expectedVersion'] as int) ||
          !_equal(rows(response['results']), rows(attempt['results']))) {
        throw const ApiException('INVALID_RESPONSE');
      }
      await _clearIntent(attempt);
      await widget.repo.records.removeIf(
        widget.orderId,
        'checklistDraft',
        'localId',
        _localId,
      );
      if (!mounted) return true;
      setState(() {
        _data = response;
        _results = rows(response['results']);
        _baseVersion = response['version'] as int;
        _dirty = false;
        _conflict = false;
        _notice = 'Đã lưu kết quả checklist lên máy chủ.';
      });
      widget.onSaved?.call();
      return true;
    } catch (e) {
      if (dispatched &&
          e is ApiException &&
          e.status != null &&
          e.status! >= 400 &&
          e.status! < 500) {
        try {
          if (dispatchedAttempt != null) await _clearIntent(dispatchedAttempt);
        } catch (_) {
          /* Keep uncertainty until storage can acknowledge its removal. */
        }
        if (e.status == 409) _conflict = true;
      }
      if (mounted) {
        setState(() => _error = '${_message(e)} Bản nháp vẫn được giữ.');
      }
      return false;
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        _changed();
      }
    }
  }

  Future<bool> _discard() async {
    if (pending && !_fenced) return false;
    try {
      _autosave?.cancel();
      await widget.repo.records.put(widget.orderId, 'checklistDraft', null);
      if (pending) {
        if (_pending != null) await _clearIntent(_pending!);
      }
      if (mounted) setState(() => _dirty = false);
      _changed();
      return true;
    } catch (e) {
      if (mounted) setState(() => _error = _message(e));
      return false;
    }
  }

  Future<bool> prepareLeave() async {
    if (_busy) return false;
    if (!_dirty && !pending) return true;
    final choice = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Rời checklist đang nhập?'),
        content: const Text(
          'Bạn có thể lưu nháp trên máy hoặc lưu kết quả lên máy chủ trước khi rời.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Tiếp tục nhập'),
          ),
          if (!pending || _fenced)
            TextButton(
              onPressed: () => Navigator.pop(context, 'discard'),
              child: const Text('Bỏ thay đổi'),
            ),
          TextButton(
            onPressed: () => Navigator.pop(context, 'local'),
            child: const Text('Lưu nháp và rời'),
          ),
          if (_canSave)
            FilledButton(
              onPressed: () => Navigator.pop(context, 'server'),
              child: const Text('Lưu lên máy chủ và rời'),
            ),
        ],
      ),
    );
    if (!mounted) return false;
    if (choice == 'discard') return _discard();
    if (choice == 'server') return save();
    if (choice == 'local') {
      try {
        await _persist();
        return true;
      } catch (e) {
        if (mounted) setState(() => _error = _message(e));
      }
    }
    return false;
  }

  Future<void> _reload() async {
    if (pending && !_fenced) {
      await _refreshAuthority();
      return;
    }
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
      if (discard != true || !mounted || !await _discard()) return;
    }
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final items = _data == null ? <Json>[] : rows(_data!['items']);
    final required = items.where((i) => i['required'] == true).toList();
    final done = required.where((i) {
      final r = _result(i['id'] as String);
      return r['status'] == 'DONE' ||
          r['status'] == 'NOT_APPLICABLE' &&
              i['allowNotApplicable'] == true &&
              '${r['note']}'.trim().isNotEmpty;
    }).length;
    final editable = _editable && !_busy && !_conflict && !pending;
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
            if (_notice != null) Text(_notice!),
            if (_data != null && items.isEmpty)
              const Text('Công việc này không có checklist bắt buộc.'),
            if (items.isNotEmpty)
              Text(
                '$done/${required.length} mục bắt buộc đã hoàn tất',
                key: const Key('checklist-progress'),
              ),
            if (_dirty)
              const Text(
                'Có thay đổi trong bản nháp cục bộ; chưa xác nhận lưu trên máy chủ.',
              ),
            if (_dirty && !_sameAssignment)
              const Text(
                'Phân công đã thay đổi. Bản nháp cũ chỉ để đối chiếu, không gửi cho phân công mới.',
              ),
            if (_conflict)
              const Text(
                'Checklist đã thay đổi. Giữ bản nháp để đối chiếu hoặc tải lại kết quả máy chủ trước khi sửa tiếp.',
              ),
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
                      key: ValueKey('$_baseVersion:${item['id']}:status'),
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
                      onChanged: editable
                          ? (v) {
                              if (v != null) {
                                _update(item['id'] as String, 'status', v);
                              }
                            }
                          : null,
                    ),
                    TextFormField(
                      key: ValueKey('$_baseVersion:${item['id']}:note'),
                      initialValue:
                          _result(item['id'] as String)['note'] as String,
                      maxLength: 2000,
                      enabled: editable,
                      decoration: const InputDecoration(
                        labelText: 'Ghi chú nội bộ / lý do không áp dụng',
                      ),
                      onChanged: (v) =>
                          _update(item['id'] as String, 'note', v),
                    ),
                  ],
                ),
              ),
            if (items.isNotEmpty && _editable && !pending)
              FilledButton(
                key: const Key('checklist-save'),
                onPressed: _canSave && _dirty ? () => unawaited(save()) : null,
                child: const Text('Lưu kết quả checklist'),
              ),
            if (pending && _editable && !_fenced)
              OutlinedButton(
                key: const Key('checklist-retry'),
                onPressed: _busy ? null : () => unawaited(save(retry: true)),
                child: const Text('Thử lại đúng lần lưu cũ'),
              ),
            TextButton(
              key: const Key('checklist-reload'),
              onPressed: _busy ? null : _reload,
              child: Text(
                pending
                    ? 'Kiểm tra kết quả từ máy chủ'
                    : 'Tải lại kết quả từ máy chủ',
              ),
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
