import 'package:flutter/material.dart';

import '../../core/api/api_exception.dart';
import '../../ui/components.dart';
import '../../ui/theme.dart';
import 'workspace_repository.dart';

class ReadView<T> extends StatefulWidget {
  const ReadView({
    super.key,
    required this.load,
    required this.builder,
    this.requestKey,
    this.onRetry,
  });
  final Future<T> Function() load;
  final Widget Function(T) builder;
  final Object? requestKey;
  final VoidCallback? onRetry;
  @override
  State<ReadView<T>> createState() => _ReadViewState<T>();
}

class _ReadViewState<T> extends State<ReadView<T>> {
  late Future<T> _future;
  @override
  void initState() {
    super.initState();
    _future = Future.sync(widget.load);
  }

  @override
  void didUpdateWidget(covariant ReadView<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.requestKey != widget.requestKey) {
      _future = Future.sync(widget.load);
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<T>(
    future: _future,
    builder: (context, s) {
      // FutureBuilder retains old data while waiting; never render it for a new
      // equipment ID, filter, refresh or session.
      if (s.connectionState != ConnectionState.done) {
        return const Padding(
          padding: EdgeInsets.all(40),
          child: Center(child: CircularProgressIndicator()),
        );
      }
      if (s.hasError) {
        final error = s.error;
        final message = error is ApiException
            ? error.code == 'TECHNICIAN_PROFILE_MISSING'
                  ? 'Tài khoản chưa được liên kết hồ sơ Technician. Nhờ quản lý tạo hồ sơ đúng tài khoản này.'
                  : error.code == 'READ_CHANGED'
                  ? 'Danh sách đã thay đổi trong lúc tải. Vui lòng tải lại.'
                  : error.userMessage
            : 'Không đọc được dữ liệu. Vui lòng thử lại.';
        return Notice(
          message,
          icon: Icons.cloud_off_outlined,
          action: TextButton(
            onPressed: () {
              widget.onRetry?.call();
              setState(() {
                _future = Future.sync(widget.load);
              });
            },
            child: const Text('Thử lại'),
          ),
        );
      }
      try {
        return widget.builder(s.data as T);
      } on ApiException catch (error) {
        return Notice(error.userMessage);
      }
    },
  );
}

class Notice extends StatelessWidget {
  const Notice(
    this.message, {
    super.key,
    this.icon = Icons.info_outline,
    this.action,
  });
  final String message;
  final IconData icon;
  final Widget? action;
  @override
  Widget build(BuildContext context) => SoftCard(
    child: Column(
      children: [
        Icon(icon, color: AppColors.teal, size: 32),
        const SizedBox(height: 12),
        Text(message, textAlign: TextAlign.center),
        ?action,
      ],
    ),
  );
}

class ReadPage extends StatelessWidget {
  const ReadPage({
    super.key,
    required this.title,
    required this.child,
    this.actions,
    this.bottom,
  });
  final String title;
  final Widget child;
  final List<Widget>? actions;
  final Widget? bottom;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(title), actions: actions),
    body: SafeArea(top: false, child: child),
    bottomNavigationBar: bottom == null
        ? null
        : Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.viewInsetsOf(context).bottom,
            ),
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: bottom,
              ),
            ),
          ),
  );
}

class ReadList extends StatelessWidget {
  const ReadList({super.key, required this.children, this.refresh});
  final List<Widget> children;
  final Future<void> Function()? refresh;
  @override
  Widget build(BuildContext context) {
    final list = ListView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        for (final child in children) ...[child, const SizedBox(height: 16)],
      ],
    );
    return refresh == null
        ? list
        : RefreshIndicator(onRefresh: refresh!, child: list);
  }
}

class DataCard extends StatelessWidget {
  const DataCard(this.title, {super.key, required this.fields});
  final String title;
  final Map<String, Object?> fields;
  @override
  Widget build(BuildContext context) => SoftCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 12),
        for (final e in fields.entries)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(e.key, style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 3),
                SelectableText(
                  e.value?.toString().isNotEmpty == true
                      ? '${e.value}'
                      : 'Chưa ghi nhận',
                ),
              ],
            ),
          ),
      ],
    ),
  );
}

Color statusColor(String status) => switch (status) {
  'CANCELLED' || 'NOT_OPERATIONAL' || 'UNRESOLVED' => AppColors.berry,
  'ON_HOLD' ||
  'HIGH' ||
  'URGENT' ||
  'PARTIALLY_RESOLVED' => const Color(0xffaf702e),
  'ASSIGNED' || 'ACCEPTED' => AppColors.violet,
  _ => AppColors.teal,
};
Widget statusPill(String status) =>
    Pill(label(status), color: statusColor(status));

class WorkCard extends StatelessWidget {
  const WorkCard(this.order, {super.key, required this.onTap});
  final WorkOrder order;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => SoftCard(
    onTap: onTap,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                order.number,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
            const Icon(Icons.arrow_outward_rounded, size: 18),
          ],
        ),
        const SizedBox(height: 10),
        Text(order.title, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 14),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            statusPill(order.status),
            Pill(label(text(order.data, 'type')), color: AppColors.muted),
            Pill(label(text(order.data, 'priority')), color: AppColors.muted),
          ],
        ),
        const SizedBox(height: 14),
        Text(
          order.start == null
              ? 'Chưa xếp lịch'
              : dateText(order.start, time: true),
        ),
        if (order.end != null)
          Text(
            'Kết thúc dự kiến: ${dateText(order.end, time: true)}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
      ],
    ),
  );
}

class PageButtons extends StatelessWidget {
  const PageButtons({
    super.key,
    required this.page,
    required this.total,
    required this.pageSize,
    required this.onPage,
  });
  final int page, total, pageSize;
  final ValueChanged<int> onPage;
  @override
  Widget build(BuildContext context) => Wrap(
    alignment: WrapAlignment.center,
    crossAxisAlignment: WrapCrossAlignment.center,
    spacing: 8,
    children: [
      IconButton(
        tooltip: 'Trang trước',
        onPressed: page > 1 ? () => onPage(page - 1) : null,
        icon: const Icon(Icons.chevron_left),
      ),
      Text(
        'Trang $page / ${total == 0 ? 1 : (total / pageSize).ceil()} · $total mục',
      ),
      IconButton(
        tooltip: 'Trang sau',
        onPressed: page * pageSize < total ? () => onPage(page + 1) : null,
        icon: const Icon(Icons.chevron_right),
      ),
    ],
  );
}

/// Explicit composition states must not turn unavailable data into zero items.
class SectionView extends StatelessWidget {
  const SectionView({super.key, required this.section, required this.builder});
  final Json section;
  final Widget Function(Object?) builder;
  @override
  Widget build(BuildContext context) {
    if (section['status'] == 'AVAILABLE') {
      try {
        return builder(section['data']);
      } on ApiException catch (error) {
        return Notice(error.userMessage);
      }
    }
    return Notice(switch (section['status']) {
      'RESTRICTED' => 'Tài khoản không có quyền đọc phần này.',
      'NOT_CONFIGURED' => 'Dịch vụ nguồn chưa được cấu hình.',
      'NOT_FOUND' => 'Dữ liệu nguồn không còn trong phạm vi truy cập.',
      'UNAVAILABLE' =>
        'Dịch vụ nguồn tạm thời không khả dụng. Kéo xuống để tải lại.',
      _ => 'Chưa nhận được phần dữ liệu này.',
    });
  }
}
