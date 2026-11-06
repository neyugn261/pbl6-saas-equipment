import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/api/api_exception.dart';
import 'notification_repository.dart';

/// Session-owned count and read operations, shared by the badge and inbox.
class NotificationController extends ChangeNotifier {
  NotificationController(this.repo);
  final NotificationRepository repo;
  int? unreadCount;
  int inboxVersion = 0;
  ApiException? countError;
  bool loading = false, _closed = false;
  int _epoch = 0;
  final _reads = <String, Future<InboxNotification>>{};
  Timer? _poll;
  void setForeground(bool active) {
    _poll?.cancel();
    _poll = null;
    if (!_closed && active) {
      _poll = Timer.periodic(const Duration(seconds: 30), (_) {
        if (!loading) unawaited(refreshCount());
      });
    }
  }

  Future<void> refreshCount() async {
    if (_closed) return;
    final epoch = ++_epoch;
    loading = true;
    notifyListeners();
    try {
      final result = await repo.unreadCount();
      if (_closed || epoch != _epoch) return;
      if (unreadCount != result) inboxVersion++;
      unreadCount = result;
      countError = null;
    } catch (e) {
      if (_closed || epoch != _epoch) return;
      final error = e is ApiException
          ? e
          : const ApiException('INVALID_RESPONSE');
      if (unreadCount != null ||
          countError?.code != error.code ||
          countError?.status != error.status) {
        inboxVersion++;
      }
      unreadCount = null;
      countError = error;
    } finally {
      if (!_closed && epoch == _epoch) {
        loading = false;
        notifyListeners();
      }
    }
  }

  Future<InboxNotification> markRead(String id) {
    if (_closed) return Future.error(const ApiException('SESSION_CHANGED'));
    return _reads.putIfAbsent(id, () async {
      try {
        final result = await repo.markRead(id);
        await refreshCount();
        if (_closed) throw const ApiException('SESSION_CHANGED');
        return result;
      } finally {
        _reads.remove(id);
      }
    });
  }

  @override
  void dispose() {
    _closed = true;
    _poll?.cancel();
    ++_epoch;
    repo.dispose();
    super.dispose();
  }
}
