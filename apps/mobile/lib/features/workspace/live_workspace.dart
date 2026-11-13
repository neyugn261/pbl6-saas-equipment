import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/api/api_exception.dart';
import '../../ui/components.dart';
import '../../ui/theme.dart';
import '../session/session_controller.dart';
import '../preferences/app_preferences.dart';
import '../preferences/preferences_screen.dart';
import '../notifications/notification_repository.dart';
import '../notifications/notification_controller.dart';
import '../notifications/notification_screens.dart';
import 'attachment_client.dart';
import 'equipment_reads.dart';
import 'job_reads.dart';
import 'personal_jobs.dart';
import 'work_calendar.dart';
import 'read_widgets.dart';
import 'workspace_repository.dart';
import 'workspace_store.dart';
import 'upload_picker.dart';
import 'upload_store.dart';

/// Authenticated workspace. Preview fixtures are never used on this route.
class LiveWorkspace extends StatefulWidget {
  const LiveWorkspace({
    super.key,
    required this.session,
    required this.preferences,
    this.store,
    this.uploads,
  });
  final SessionController session;
  final AppPreferences preferences;
  final WorkspaceStore? store;
  final ScopedUploads? uploads;
  @override
  State<LiveWorkspace> createState() => _LiveWorkspaceState();
}

class _LiveWorkspaceState extends State<LiveWorkspace>
    with WidgetsBindingObserver {
  late final WorkspaceRepository repo;
  late final NotificationController notifications;
  late Future<PersonalWork> _work;
  int _index = 0, _revision = 0;
  final _jobFilters = JobFilters();
  final _calendar = CalendarSelection();
  final _visited = <int>{0};
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final user = widget.session.user!;
    Future<Object?> request(
      String method,
      String path, {
      Json? body,
      String? idempotencyKey,
    }) async {
      if (widget.session.user?.id != user.id ||
          widget.session.user?.tenantId != user.tenantId ||
          widget.session.user?.roles.join(',') != user.roles.join(',')) {
        throw const ApiException('SESSION_CHANGED');
      }
      return widget.session.authorizedRequest(
        method,
        path,
        body: body,
        idempotencyKey: idempotencyKey,
      );
    }

    repo = WorkspaceRepository(
      (path) => request('GET', path),
      user,
      store: widget.store,
      selection: widget.uploads,
      write: (path, body, {idempotencyKey}) =>
          request('POST', path, body: body, idempotencyKey: idempotencyKey),
      attachments: AttachmentClient(
        api: (method, path, {body, idempotencyKey}) {
          if (widget.session.user?.id != user.id ||
              widget.session.user?.tenantId != user.tenantId ||
              widget.session.user?.roles.join(',') != user.roles.join(',')) {
            throw const ApiException('SESSION_CHANGED');
          }
          return widget.session.authorizedRequest(
            method,
            path,
            body: body,
            idempotencyKey: idempotencyKey,
          );
        },
        sessionScope: () =>
            widget.session.phase == SessionPhase.authenticated &&
                widget.session.user?.id == user.id &&
                widget.session.user?.tenantId == user.tenantId &&
                widget.session.user?.roles.join(',') == user.roles.join(',')
            ? '${user.tenantId}/${user.id}'
            : '',
      ),
    );
    final files = widget.uploads;
    if (files != null) {
      repo.attachments!.mayWrite = (attempt) async {
        final order = await repo.order(attempt.workOrderId);
        if (!attempt.report) {
          return order.currentFor(user.id) &&
              !order.terminal &&
              [
                'ACCEPTED',
                'TRAVELLING',
                'IN_PROGRESS',
                'ON_HOLD',
              ].contains(order.status) &&
              nested(order.data, 'currentAssignment')['id'] ==
                  attempt.authorityId;
        }
        final report = await repo.get(
          '${WorkspaceRepository.wo}/work-orders/${attempt.workOrderId}/service-report',
        );
        final technician = await repo.technician();
        return order.status == 'COMPLETED' &&
            report['id'] == attempt.authorityId &&
            report['technicianId'] == technician['id'];
      };
      repo.attachments!.persistenceReady = files.persistence.then(
        (store) => DurableUploads(repo.records, store.files),
      );
      unawaited(
        repo.attachments!.persistenceReady!.then<void>(
          (_) {},
          onError: (Object _, StackTrace _) {},
        ),
      );
    }
    repo.addListener(_businessChanged);
    notifications = NotificationController(
      NotificationRepository((method, path) => request(method, path)),
    );
    notifications.setForeground(
      WidgetsBinding.instance.lifecycleState == null ||
          WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed,
    );
    unawaited(notifications.refreshCount());
    _work = repo.personalWork();
    // ReadView attaches its listener during the first build. Attach an error
    // listener immediately too, for synchronous test transports / fast failures.
    unawaited(_work.then<void>((_) {}, onError: (Object _, StackTrace _) {}));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    repo.removeListener(_businessChanged);
    notifications.dispose();
    repo.dispose();
    super.dispose();
  }

  void _businessChanged() {
    if (mounted) unawaited(_refresh());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    notifications.setForeground(state == AppLifecycleState.resumed);
    if (state == AppLifecycleState.resumed &&
        widget.session.phase == SessionPhase.authenticated) {
      unawaited(_refresh());
    }
  }

  Future<void> _refresh() async {
    unawaited(notifications.refreshCount());
    setState(() {
      _revision++;
      _work = repo.personalWork();
      unawaited(_work.then<void>((_) {}, onError: (Object _, StackTrace _) {}));
    });
    try {
      await _work;
    } catch (_) {
      /* ReadView shows the failure. */
    }
  }

  void _go(int index, [String? stage]) => setState(() {
    _index = index;
    _visited.add(index);
    if (index == 1 && stage != null) _jobFilters.shortcut(stage);
  });
  Widget _personal(Widget Function(PersonalWork) builder) =>
      ReadView<PersonalWork>(
        requestKey: _revision,
        load: () => _work,
        onRetry: () => unawaited(_refresh()),
        builder: builder,
      );
  Widget _header(String title, {String? subtitle}) => PageHeading(
    title,
    subtitle: subtitle,
    action: RoundIcon(
      Icons.refresh_rounded,
      label: 'Tải lại',
      onTap: () => unawaited(_refresh()),
    ),
  );
  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      bottom: false,
      child: IndexedStack(
        index: _index,
        children: [
          ReadList(
            refresh: _refresh,
            children: [
              if (widget.uploads?.recoveryMessage != null)
                Notice(
                  widget.uploads!.recoveryMessage!,
                  action: TextButton(
                    onPressed: () => openPage(
                      context,
                      JobReadScreen(
                        repo: repo,
                        id: widget.uploads!.recoveryOrderId!,
                      ),
                    ),
                    child: const Text('Mở công việc có tệp khôi phục'),
                  ),
                ),
              Row(
                children: [
                  CircleAvatar(
                    backgroundColor: AppColors.palePeach,
                    child: Text(
                      (widget.session.user ?? repo.user)
                          .fullName
                          .characters
                          .first
                          .toUpperCase(),
                      style: const TextStyle(color: AppColors.berry),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Xin chào, ${(widget.session.user ?? repo.user).fullName}',
                    ),
                  ),
                  NotificationBell(
                    controller: notifications,
                    onOpen: () => openPage(
                      context,
                      NotificationInbox(
                        controller: notifications,
                        workspace: repo,
                      ),
                    ),
                  ),
                ],
              ),
              _header(
                'Hôm nay của bạn',
                subtitle: '${dateText(businessToday())} · Giờ Việt Nam (UTC+7)',
              ),
              _personal((work) => _home(work)),
            ],
          ),
          if (_visited.contains(1))
            ReadList(
              refresh: _refresh,
              children: [
                _header('Công việc của tôi'),
                _personal(
                  (w) => PersonalJobs(
                    key: const Key('personal-jobs'),
                    work: w,
                    repo: repo,
                    filters: _jobFilters,
                  ),
                ),
              ],
            )
          else
            const SizedBox.shrink(),
          if (_visited.contains(2))
            ReadList(
              refresh: _refresh,
              children: [
                _header(
                  'Lịch công việc',
                  subtitle: 'Lịch dự kiến · Giờ Việt Nam (UTC+7)',
                ),
                _personal(
                  (w) =>
                      WorkCalendar(work: w, repo: repo, selection: _calendar),
                ),
              ],
            )
          else
            const SizedBox.shrink(),
          if (_visited.contains(3))
            EquipmentReads(repo: repo, revision: _revision)
          else
            const SizedBox.shrink(),
          if (_visited.contains(4)) _profile() else const SizedBox.shrink(),
        ],
      ),
    ),
    bottomNavigationBar: NavigationBar(
      selectedIndex: _index,
      onDestinationSelected: _go,
      destinations: const [
        NavigationDestination(
          key: Key('nav-home'),
          icon: Icon(Icons.home_outlined),
          selectedIcon: Icon(Icons.home_rounded),
          label: 'Trang chủ',
        ),
        NavigationDestination(
          key: Key('nav-jobs'),
          icon: Icon(Icons.work_outline_rounded),
          selectedIcon: Icon(Icons.work_rounded),
          label: 'Công việc',
        ),
        NavigationDestination(
          key: Key('nav-schedule'),
          icon: Icon(Icons.calendar_today_outlined),
          selectedIcon: Icon(Icons.calendar_month_rounded),
          label: 'Lịch',
        ),
        NavigationDestination(
          key: Key('nav-equipment'),
          icon: Icon(Icons.precision_manufacturing_outlined),
          selectedIcon: Icon(Icons.precision_manufacturing_rounded),
          label: 'Thiết bị',
        ),
        NavigationDestination(
          key: Key('nav-profile'),
          icon: Icon(Icons.person_outline_rounded),
          selectedIcon: Icon(Icons.person_rounded),
          label: 'Cá nhân',
        ),
      ],
    ),
  );
  Widget _home(PersonalWork work) {
    final active = work.current;
    final today = businessToday();
    final done = work.orders.where((w) => w.status == 'COMPLETED').length;
    final completedToday = work.orders.where((w) {
      final d = wallTime(w.data['completedAt']);
      return w.status == 'COMPLETED' && d != null && sameDate(d, today);
    }).length;
    final attention = active
        .where(
          (w) =>
              w.status == 'ASSIGNED' ||
              w.status == 'ON_HOLD' ||
              (w.start != null &&
                  w.start!.isBefore(today.add(const Duration(days: 1)))),
        )
        .toList();
    final upcoming =
        active
            .where((w) => w.start != null && !w.start!.isBefore(today))
            .toList()
          ..sort((a, b) => a.start!.compareTo(b.start!));
    final progress = work.orders.isEmpty ? 0.0 : done / work.orders.length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SoftCard(
          child: Column(
            children: [
              SizedBox(
                height: 150,
                width: double.infinity,
                child: CustomPaint(
                  painter: _ProgressArc(progress),
                  child: Align(
                    alignment: Alignment.bottomCenter,
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        '${(progress * 100).round()}%',
                        style: const TextStyle(
                          fontSize: 44,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                '$done / ${work.orders.length} công việc từng được phân công đã hoàn thành',
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        LayoutBuilder(
          builder: (context, c) => Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              _metric(
                'Chờ tiếp nhận',
                active.where((w) => w.status == 'ASSIGNED').length,
                c.maxWidth,
                AppColors.violet,
                () => _go(1, 'ASSIGNED'),
              ),
              _metric(
                'Đang thực hiện',
                active
                    .where(
                      (w) => ['IN_PROGRESS', 'TRAVELLING'].contains(w.status),
                    )
                    .length,
                c.maxWidth,
                AppColors.teal,
                () => _go(1, 'IN_PROGRESS,TRAVELLING'),
              ),
              _metric(
                'Tạm dừng',
                active.where((w) => w.status == 'ON_HOLD').length,
                c.maxWidth,
                AppColors.berry,
                () => _go(1, 'ON_HOLD'),
              ),
              _metric(
                'Hoàn thành hôm nay',
                completedToday,
                c.maxWidth,
                const Color(0xffad702e),
                () => _go(1, 'COMPLETED_TODAY'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        const SectionTitle('Cần chú ý'),
        if (attention.isEmpty)
          const Notice('Không có công việc cần chú ý.')
        else
          ...attention
              .take(3)
              .map(
                (w) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _card(w),
                ),
              ),
        const SectionTitle('Lịch sắp tới'),
        if (upcoming.isEmpty)
          const Notice('Chưa có công việc được xếp lịch sắp tới.')
        else
          ...upcoming
              .take(2)
              .map(
                (w) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _card(w),
                ),
              ),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: () => _go(2),
              icon: const Icon(Icons.calendar_month),
              label: const Text('Xem lịch'),
            ),
            OutlinedButton.icon(
              onPressed: () => _go(3),
              icon: const Icon(Icons.precision_manufacturing),
              label: const Text('Tra thiết bị'),
            ),
            OutlinedButton.icon(
              onPressed: () => openPage(context, QrReadScreen(repo: repo)),
              icon: const Icon(Icons.qr_code),
              label: const Text('Tra mã QR'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        const Text(
          'Số liệu từ các lượt đọc độc lập. Kéo xuống để cập nhật.',
          style: TextStyle(fontSize: 12, color: AppColors.muted),
        ),
      ],
    );
  }

  Widget _metric(
    String title,
    int count,
    double width,
    Color color,
    VoidCallback tap,
  ) => SizedBox(
    width: (width - 12) / 2,
    child: SoftCard(
      onTap: tap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$count',
            style: TextStyle(
              fontSize: 30,
              color: readableAccent(context, color),
              fontWeight: FontWeight.w600,
            ),
          ),
          Text(title),
        ],
      ),
    ),
  );
  Widget _card(WorkOrder w) => WorkCard(
    w,
    onTap: () => openPage(context, JobReadScreen(repo: repo, id: w.id)),
  );
  Widget _profile() => ReadList(
    refresh: _refresh,
    children: [
      _header('Cá nhân'),
      DataCard(
        (widget.session.user ?? repo.user).fullName,
        fields: {
          'Email': (widget.session.user ?? repo.user).email,
          'Vai trò': (widget.session.user ?? repo.user).roles
              .map(label)
              .join(', '),
        },
      ),
      ReadView<Json>(
        requestKey: _revision,
        load: repo.technician,
        builder: (t) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            DataCard(
              'Hồ sơ kỹ thuật viên',
              fields: {
                'Mã nhân viên': t['employeeCode'],
                'Trạng thái': label(text(t, 'status')),
              },
            ),
            const SizedBox(height: 16),
            if (t['branchId'] != null)
              ReadView<Json>(
                requestKey: _revision,
                load: () =>
                    repo.get('/api/organization/branches/${t['branchId']}'),
                builder: (b) => DataCard(
                  'Chi nhánh',
                  fields: {
                    'Tên': b['name'],
                    'Mã': b['code'],
                    'Địa chỉ': b['address'],
                  },
                ),
              )
            else
              const Notice('Hồ sơ chưa được gán chi nhánh.'),
            const SizedBox(height: 16),
            DataCard(
              'Kỹ năng',
              fields: {
                if (rows(t['skills']).isEmpty)
                  'Kỹ năng': 'Chưa có kỹ năng được gán',
                for (final s in rows(t['skills']))
                  text(
                    s,
                    'code',
                  ): '${text(s, 'name')} · ${s['level'] is int ? 'Cấp ${s['level']}/5' : 'Chưa ghi cấp độ'}',
              },
            ),
          ],
        ),
      ),
      const Notice(
        'Chi nhánh, kỹ năng và trạng thái do quản lý cập nhật. Trạng thái Đang bận/Sẵn sàng được hệ thống tính theo công việc. Liên hệ quản lý nếu cần thay đổi hồ sơ hoặc mật khẩu.',
      ),
      ListTile(
        key: const Key('open-appearance'),
        leading: const Icon(Icons.palette_outlined),
        title: const Text('Giao diện'),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => openPage(
          context,
          PreferencesScreen(preferences: widget.preferences),
        ),
      ),
      ListTile(
        key: const Key('open-help'),
        leading: const Icon(Icons.help_outline),
        title: const Text('Hướng dẫn sử dụng'),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => openPage(context, const MobileHelpScreen()),
      ),
      ListTile(
        key: const Key('open-app-info'),
        leading: const Icon(Icons.info_outline),
        title: const Text('Thông tin ứng dụng'),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => openPage(context, const AppInformationScreen()),
      ),
      if (widget.session.message != null) Notice(widget.session.message!),
      OutlinedButton(
        onPressed: widget.session.busy ? null : widget.session.revalidate,
        child: const Text('Kiểm tra phiên'),
      ),
      FilledButton(
        key: const Key('logout'),
        onPressed: widget.session.busy ? null : _logout,
        child: const Text('Đăng xuất'),
      ),
    ],
  );

  Future<void> _logout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Đăng xuất khỏi ứng dụng?'),
        content: const Text(
          'Nháp báo cáo, checklist và tệp được giữ trên thiết bị cho tài khoản này, không tự gửi. Đăng nhập lại đúng tài khoản để tiếp tục. Gỡ ứng dụng hoặc xóa dữ liệu ứng dụng sẽ mất nháp.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Ở lại'),
          ),
          FilledButton(
            key: const Key('confirm-logout'),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Đăng xuất'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) await widget.session.logout();
  }
}

class _ProgressArc extends CustomPainter {
  _ProgressArc(this.value);
  final double value;
  @override
  void paint(Canvas canvas, Size size) {
    final width = math.min(size.width - 28, size.height * 2 - 36);
    final rect = Rect.fromLTWH(
      (size.width - width) / 2,
      size.height - width / 2 - 12,
      width,
      width,
    );
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 28
      ..color = AppColors.line;
    canvas.drawArc(rect, math.pi, math.pi, false, paint);
    paint.color = AppColors.teal;
    canvas.drawArc(rect, math.pi, math.pi * value, false, paint);
  }

  @override
  bool shouldRepaint(covariant _ProgressArc oldDelegate) =>
      value != oldDelegate.value;
}
