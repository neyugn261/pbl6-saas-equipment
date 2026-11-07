import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api/api_exception.dart';
import '../../ui/components.dart';
import '../workspace/job_reads.dart';
import '../workspace/read_widgets.dart';
import '../workspace/workspace_repository.dart';
import 'notification_controller.dart';
import 'notification_repository.dart';

class NotificationBell extends StatelessWidget {
  const NotificationBell({
    super.key,
    required this.controller,
    required this.onOpen,
  });
  final NotificationController controller;
  final VoidCallback onOpen;
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: controller,
    builder: (context, _) {
      final count = controller.unreadCount;
      final error = controller.countError != null;
      final description = error
          ? 'Thông báo · Chưa tải được số chưa đọc'
          : count == null
          ? 'Thông báo'
          : 'Thông báo · $count chưa đọc';
      return Semantics(
        key: const Key('notifications-open'),
        container: true,
        label: description,
        button: true,
        onTap: onOpen,
        child: ExcludeSemantics(
          child: IconButton(
            tooltip: description,
            onPressed: onOpen,
            icon: Badge(
              isLabelVisible: error || (count ?? 0) > 0,
              label: Text(
                error
                    ? '!'
                    : (count ?? 0) > 99
                    ? '99+'
                    : '$count',
              ),
              child: const Icon(Icons.notifications_none_rounded),
            ),
          ),
        ),
      );
    },
  );
}

class NotificationInbox extends StatefulWidget {
  const NotificationInbox({
    super.key,
    required this.controller,
    required this.workspace,
  });
  final NotificationController controller;
  final WorkspaceRepository workspace;
  @override
  State<NotificationInbox> createState() => _NotificationInboxState();
}

class _NotificationInboxState extends State<NotificationInbox>
    with WidgetsBindingObserver {
  int _page = 1, _filter = 0, _revision = 0;
  final _marking = <String>{};
  String? _error;
  bool _opening = false;
  static const _filters = ['ALL', 'UNREAD', 'READ'];
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(widget.controller.refreshCount());
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_refresh());
  }

  Future<void> _refresh() async {
    if (!mounted) return;
    setState(() {
      _revision++;
      _error = null;
    });
    await widget.controller.refreshCount();
  }

  Future<void> _read(InboxNotification item) async {
    if (!_marking.add(item.id)) return;
    setState(() => _error = null);
    try {
      await widget.controller.markRead(item.id);
      if (mounted) {
        setState(() {
          _revision++;
          if (_filter == 1) _page = 1;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(
          () => _error =
              '${_message(e)} Kéo xuống để kiểm tra trạng thái đã đọc trước khi thử lại.',
        );
      }
    } finally {
      if (mounted) setState(() => _marking.remove(item.id));
    }
  }

  Future<void> _open(InboxNotification item) async {
    if (_opening) return;
    setState(() => _opening = true);
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => NotificationDetail(
          item: item,
          controller: widget.controller,
          workspace: widget.workspace,
        ),
      ),
    );
    if (mounted) {
      setState(() {
        _opening = false;
        if (_filter == 1) _page = 1;
      });
      await _refresh();
    }
  }

  @override
  Widget build(BuildContext context) => ReadPage(
    title: 'Thông báo',
    actions: [
      IconButton(
        tooltip: 'Tải lại thông báo',
        onPressed: () => unawaited(_refresh()),
        icon: const Icon(Icons.refresh),
      ),
    ],
    child: ReadList(
      refresh: _refresh,
      children: [
        AnimatedBuilder(
          animation: widget.controller,
          builder: (context, _) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                widget.controller.unreadCount == null
                    ? 'Chưa xác định số thông báo chưa đọc'
                    : '${widget.controller.unreadCount} thông báo chưa đọc',
              ),
              if (widget.controller.countError != null)
                Notice(
                  widget.controller.countError!.userMessage,
                  action: TextButton(
                    onPressed: () =>
                        unawaited(widget.controller.refreshCount()),
                    child: const Text('Tải lại số chưa đọc'),
                  ),
                ),
            ],
          ),
        ),
        ChoicePills(
          labels: const ['Tất cả', 'Chưa đọc', 'Đã đọc'],
          selected: _filter,
          onSelected: (i) => setState(() {
            _filter = i;
            _page = 1;
            _error = null;
          }),
        ),
        if (_error != null) Notice(_error!),
        AnimatedBuilder(
          animation: widget.controller,
          builder: (context, _) => ReadView<PageData<InboxNotification>>(
            requestKey:
                '$_page/$_filter/$_revision/${widget.controller.inboxVersion}',
            load: () => widget.controller.repo.list(
              page: _page,
              readStatus: _filters[_filter],
            ),
            builder: (data) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (data.items.isEmpty)
                  const Notice('Không có thông báo phù hợp.'),
                for (final item in data.items)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: SoftCard(
                      onTap: _opening ? null : () => unawaited(_open(item)),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              if (item.unread)
                                const Padding(
                                  padding: EdgeInsets.only(right: 8),
                                  child: Icon(Icons.circle, size: 9),
                                ),
                              Expanded(
                                child: Text(
                                  item.title,
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleMedium,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(item.body),
                          const SizedBox(height: 8),
                          Text(
                            dateText(
                              item.createdAt!.toIso8601String(),
                              time: true,
                            ),
                          ),
                          if (item.unread)
                            TextButton(
                              key: Key('notification-read-${item.id}'),
                              onPressed: _marking.contains(item.id)
                                  ? null
                                  : () => unawaited(_read(item)),
                              child: Text(
                                _marking.contains(item.id)
                                    ? 'Đang đánh dấu…'
                                    : 'Đánh dấu đã đọc',
                              ),
                            )
                          else
                            const Text('Đã đọc'),
                        ],
                      ),
                    ),
                  ),
                PageButtons(
                  page: data.page,
                  total: data.total,
                  pageSize: data.pageSize,
                  onPage: (page) => setState(() => _page = page),
                ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}

String _message(Object error) => error is ApiException
    ? error.userMessage
    : 'Không đọc được dữ liệu. Vui lòng thử lại.';

class NotificationDetail extends StatefulWidget {
  const NotificationDetail({
    super.key,
    required this.item,
    required this.controller,
    required this.workspace,
  });
  final InboxNotification item;
  final NotificationController controller;
  final WorkspaceRepository workspace;
  @override
  State<NotificationDetail> createState() => _NotificationDetailState();
}

class _NotificationDetailState extends State<NotificationDetail> {
  late InboxNotification _item;
  bool _reading = false, _opening = false;
  String? _readError, _linkError;
  @override
  void initState() {
    super.initState();
    _item = widget.item;
    if (_item.unread) unawaited(_read());
  }

  Future<void> _read() async {
    if (_reading) return;
    setState(() {
      _reading = true;
      _readError = null;
    });
    try {
      final read = await widget.controller.markRead(_item.id);
      if (mounted) setState(() => _item = read);
    } catch (e) {
      if (mounted) setState(() => _readError = _message(e));
    } finally {
      if (mounted) setState(() => _reading = false);
    }
  }

  Future<void> _openJob() async {
    if (_opening || !_item.linksToWorkOrder) return;
    setState(() {
      _opening = true;
      _linkError = null;
    });
    try {
      // Reauthorize the referenced WO now; old notifications grant no access.
      final order = await widget.workspace.order(_item.resourceId!);
      if (order.id != _item.resourceId) {
        throw const ApiException('INVALID_RESPONSE');
      }
      if (!mounted) return;
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) =>
              JobReadScreen(repo: widget.workspace, id: _item.resourceId!),
        ),
      );
    } catch (e) {
      if (mounted) {
        setState(
          () => _linkError =
              e is ApiException && (e.status == 403 || e.status == 404)
              ? 'Công việc không còn trong phạm vi truy cập của bạn. Thông báo này không cấp quyền xem công việc.'
              : _message(e),
        );
      }
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  @override
  Widget build(BuildContext context) => ReadPage(
    title: 'Chi tiết thông báo',
    child: ReadList(
      children: [
        PageHeading(
          _item.title,
          subtitle: dateText(_item.createdAt!.toIso8601String(), time: true),
        ),
        SelectableText(_item.body),
        Text(
          _reading
              ? 'Đang đánh dấu đã đọc…'
              : _item.unread
              ? 'Chưa đọc'
              : 'Đã đọc',
        ),
        if (_readError != null)
          Notice(
            _readError!,
            action: TextButton(
              onPressed: _reading ? null : () => unawaited(_read()),
              child: const Text('Thử lại đánh dấu đã đọc'),
            ),
          ),
        if (_linkError != null) Notice(_linkError!),
        if (_item.linksToWorkOrder)
          FilledButton(
            key: const Key('notification-open-work-order'),
            onPressed: _opening ? null : () => unawaited(_openJob()),
            child: Text(
              _opening ? 'Đang kiểm tra công việc…' : 'Xem công việc',
            ),
          )
        else
          const Text('Bạn có thể xem nội dung thông báo tại đây.'),
      ],
    ),
  );
}
