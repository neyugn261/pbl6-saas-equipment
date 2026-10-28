import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/api/api_exception.dart';
import '../../ui/components.dart';
import '../../ui/theme.dart';
import '../session/session_controller.dart';
import 'equipment_reads.dart';
import 'job_reads.dart';
import 'read_widgets.dart';
import 'workspace_repository.dart';

/// Authenticated workspace. Preview fixtures are never used on this route.
class LiveWorkspace extends StatefulWidget {
  const LiveWorkspace({super.key, required this.session});
  final SessionController session;
  @override
  State<LiveWorkspace> createState() => _LiveWorkspaceState();
}

class _LiveWorkspaceState extends State<LiveWorkspace>
    with WidgetsBindingObserver {
  late final WorkspaceRepository repo;
  late Future<PersonalWork> _work;
  int _index = 0, _revision = 0;
  String _stage = '';
  final _visited = <int>{0};
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final user = widget.session.user!;
    repo = WorkspaceRepository((path) async {
      if (widget.session.user?.id != user.id ||
          widget.session.user?.tenantId != user.tenantId ||
          widget.session.user?.roles.join(',') != user.roles.join(',')) {
        throw const ApiException('SESSION_CHANGED');
      }
      return widget.session.authorizedRequest('GET', path);
    }, user);
    _work = repo.personalWork();
    // ReadView attaches its listener during the first build. Attach an error
    // listener immediately too, for synchronous test transports / fast failures.
    unawaited(_work.then<void>((_) {}, onError: (Object _, StackTrace _) {}));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        widget.session.phase == SessionPhase.authenticated) {
      unawaited(_refresh());
    }
  }

  Future<void> _refresh() async {
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

  void _go(int index, [String stage = '']) => setState(() {
    _index = index;
    _visited.add(index);
    if (index == 1) _stage = stage;
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
              Row(
                children: [
                  CircleAvatar(
                    backgroundColor: AppColors.palePeach,
                    child: Text(
                      repo.user.fullName.characters.first.toUpperCase(),
                      style: const TextStyle(color: AppColors.berry),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: Text('Xin chào, ${repo.user.fullName}')),
                  RoundIcon(
                    Icons.notifications_none_rounded,
                    label: 'Thông báo',
                    onTap: () => openPage(
                      context,
                      const ReadPage(
                        title: 'Thông báo',
                        child: ReadList(
                          children: [
                            Notice(
                              'Thông báo đang chờ Notification Service (M3). Chưa có hộp thư từ backend.',
                            ),
                          ],
                        ),
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
                    initialStage: _stage,
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
                _personal((w) => WorkCalendar(work: w, repo: repo)),
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
              color: color,
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
        repo.user.fullName,
        fields: {
          'Email': repo.user.email,
          'Vai trò': repo.user.roles.map(label).join(', '),
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
        'Trạng thái và kỹ năng do backend quản lý. Cập nhật hồ sơ, đổi mật khẩu và bản nháp chờ giai đoạn sau.',
      ),
      if (widget.session.message != null) Notice(widget.session.message!),
      OutlinedButton(
        onPressed: widget.session.busy ? null : widget.session.revalidate,
        child: const Text('Kiểm tra phiên'),
      ),
      FilledButton(
        key: const Key('logout'),
        onPressed: widget.session.busy ? null : widget.session.logout,
        child: const Text('Đăng xuất'),
      ),
    ],
  );
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

class PersonalJobs extends StatefulWidget {
  const PersonalJobs({
    super.key,
    required this.work,
    required this.repo,
    this.initialStage = '',
  });
  final PersonalWork work;
  final WorkspaceRepository repo;
  final String initialStage;
  @override
  State<PersonalJobs> createState() => _PersonalJobsState();
}

class _PersonalJobsState extends State<PersonalJobs> {
  String _q = '', _status = '', _type = '', _priority = '';
  bool _history = false, _completedToday = false;
  int _page = 1;
  DateTimeRange? _dates;
  @override
  void initState() {
    super.initState();
    _applyInitial();
  }

  @override
  void didUpdateWidget(covariant PersonalJobs old) {
    super.didUpdateWidget(old);
    if (old.initialStage != widget.initialStage) _applyInitial();
    if (!identical(old.work, widget.work)) _page = 1;
  }

  void _applyInitial() {
    _completedToday = widget.initialStage == 'COMPLETED_TODAY';
    _status = _completedToday ? 'COMPLETED' : widget.initialStage;
    _history = _status == 'COMPLETED';
    _page = 1;
  }

  @override
  Widget build(BuildContext context) {
    final data =
        (_history ? widget.work.history : widget.work.current).where((w) {
          final q = _q.toLowerCase();
          final d = w.start;
          return (q.isEmpty ||
                  '${w.number} ${w.title}'.toLowerCase().contains(q)) &&
              (_status.isEmpty || _status.split(',').contains(w.status)) &&
              (!_completedToday ||
                  wallTime(w.data['completedAt']) != null &&
                      sameDate(
                        wallTime(w.data['completedAt'])!,
                        businessToday(),
                      )) &&
              (_type.isEmpty || w.data['type'] == _type) &&
              (_priority.isEmpty || w.data['priority'] == _priority) &&
              (_dates == null ||
                  d != null &&
                      !d.isBefore(_dates!.start) &&
                      d.isBefore(_dates!.end.add(const Duration(days: 1))));
        }).toList()..sort(
          (a, b) => text(
            b.data,
            'createdAt',
            '',
          ).compareTo(text(a.data, 'createdAt', '')),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ChoicePills(
          labels: const ['Hiện tại', 'Lịch sử'],
          selected: _history ? 1 : 0,
          onSelected: (i) => setState(() {
            _history = i == 1;
            _completedToday = false;
            _status = '';
            _page = 1;
          }),
        ),
        const SizedBox(height: 16),
        if (_completedToday)
          TextButton(
            onPressed: () => setState(() => _completedToday = false),
            child: const Text('Hoàn thành hôm nay · Bỏ lọc ngày hoàn thành'),
          ),
        TextField(
          key: const Key('jobs-search'),
          maxLength: 100,
          decoration: const InputDecoration(
            hintText: 'Mã WO hoặc tiêu đề',
            prefixIcon: Icon(Icons.search),
            counterText: '',
          ),
          onChanged: (v) => setState(() {
            _q = v.trim();
            _page = 1;
          }),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _dropdown('Trạng thái', _status, const [
              'CREATED',
              'IN_PROGRESS,TRAVELLING',
              'ASSIGNED',
              'ACCEPTED',
              'TRAVELLING',
              'IN_PROGRESS',
              'ON_HOLD',
              'COMPLETED',
              'CANCELLED',
            ], (v) => _status = v),
            _dropdown('Loại', _type, const [
              'REPAIR',
              'WARRANTY',
              'MAINTENANCE',
              'INSPECTION',
            ], (v) => _type = v),
            _dropdown('Ưu tiên', _priority, const [
              'LOW',
              'NORMAL',
              'HIGH',
              'URGENT',
            ], (v) => _priority = v),
            OutlinedButton.icon(
              icon: const Icon(Icons.date_range),
              label: Text(
                _dates == null
                    ? 'Khoảng lịch'
                    : '${dateText(_dates!.start)} – ${dateText(_dates!.end)}',
              ),
              onPressed: () async {
                final now = businessToday();
                final selected = await showDateRangePicker(
                  context: context,
                  firstDate: DateTime(now.year - 10),
                  lastDate: DateTime(now.year + 10),
                );
                if (mounted && selected != null) {
                  setState(() {
                    _dates = DateTimeRange(
                      start: DateTime.utc(
                        selected.start.year,
                        selected.start.month,
                        selected.start.day,
                      ),
                      end: DateTime.utc(
                        selected.end.year,
                        selected.end.month,
                        selected.end.day,
                      ),
                    );
                    _page = 1;
                  });
                }
              },
            ),
            if (_dates != null)
              TextButton(
                onPressed: () => setState(() {
                  _dates = null;
                  _page = 1;
                }),
                child: const Text('Bỏ ngày'),
              ),
          ],
        ),
        const SizedBox(height: 16),
        Text(
          _history
              ? 'Các công việc từng được phân công, hiện không còn là phân công của bạn (bao gồm hoàn thành, hủy, từ chối hoặc gỡ phân công).'
              : 'Chỉ công việc đang được phân công cho tài khoản này.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 16),
        if (data.isEmpty)
          const Notice('Không có công việc phù hợp.')
        else
          ...data
              .skip((_page - 1) * 20)
              .take(20)
              .map(
                (w) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: WorkCard(
                    w,
                    onTap: () => openPage(
                      context,
                      JobReadScreen(repo: widget.repo, id: w.id),
                    ),
                  ),
                ),
              ),
        PageButtons(
          page: _page,
          total: data.length,
          pageSize: 20,
          onPage: (p) => setState(() => _page = p),
        ),
      ],
    );
  }

  Widget _dropdown(
    String hint,
    String value,
    List<String> choices,
    ValueChanged<String> change,
  ) => SizedBox(
    width: math.min(MediaQuery.sizeOf(context).width - 40, 250),
    child: DropdownButton<String>(
      isExpanded: true,
      value: ['', ...choices].contains(value) ? value : '',
      items: [
        DropdownMenuItem(value: '', child: Text(hint)),
        ...choices.map(
          (v) => DropdownMenuItem(value: v, child: Text(label(v))),
        ),
      ],
      onChanged: (v) => setState(() {
        change(v ?? '');
        _page = 1;
      }),
    ),
  );
}

class WorkCalendar extends StatefulWidget {
  const WorkCalendar({super.key, required this.work, required this.repo});
  final PersonalWork work;
  final WorkspaceRepository repo;
  @override
  State<WorkCalendar> createState() => _WorkCalendarState();
}

class _WorkCalendarState extends State<WorkCalendar> {
  DateTime _date = businessToday();
  int _mode = 0;
  bool _history = false;
  @override
  Widget build(BuildContext context) {
    final source = _history ? widget.work.orders : widget.work.current;
    final start = _mode == 0
        ? _date
        : _mode == 1
        ? _date.subtract(Duration(days: _date.weekday - 1))
        : DateTime.utc(_date.year, _date.month);
    final end = _mode == 0
        ? start.add(const Duration(days: 1))
        : _mode == 1
        ? start.add(const Duration(days: 7))
        : DateTime.utc(_date.year, _date.month + 1);
    final scheduled =
        source
            .where(
              (w) =>
                  w.start != null &&
                  !w.start!.isBefore(start) &&
                  w.start!.isBefore(end),
            )
            .toList()
          ..sort((a, b) => a.start!.compareTo(b.start!));
    final unscheduled = widget.work.current
        .where((w) => w.start == null)
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ChoicePills(
          labels: const ['Ngày', 'Tuần', 'Tháng'],
          selected: _mode,
          onSelected: (i) => setState(() => _mode = i),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            IconButton(
              tooltip: 'Kỳ trước',
              onPressed: () => _move(-1),
              icon: const Icon(Icons.chevron_left),
            ),
            Expanded(
              child: TextButton(
                onPressed: () async {
                  final selected = await showDatePicker(
                    context: context,
                    initialDate: DateTime(_date.year, _date.month, _date.day),
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2100),
                  );
                  if (mounted && selected != null) {
                    setState(
                      () => _date = DateTime.utc(
                        selected.year,
                        selected.month,
                        selected.day,
                      ),
                    );
                  }
                },
                child: Text(
                  _mode == 2 ? '${_date.month}/${_date.year}' : dateText(_date),
                ),
              ),
            ),
            IconButton(
              tooltip: 'Kỳ sau',
              onPressed: () => _move(1),
              icon: const Icon(Icons.chevron_right),
            ),
          ],
        ),
        if (_mode != 0)
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (
                var d = start;
                d.isBefore(end);
                d = d.add(const Duration(days: 1))
              )
                ChoiceChip(
                  label: Text('${d.day}'),
                  selected: sameDate(d, _date),
                  avatar:
                      source.any(
                        (w) => w.start != null && sameDate(w.start!, d),
                      )
                      ? const Icon(Icons.circle, size: 6)
                      : null,
                  onSelected: (_) => setState(() => _date = d),
                ),
            ],
          ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Bao gồm lịch sử cá nhân'),
          value: _history,
          onChanged: (v) => setState(() => _history = v),
        ),
        Text(
          '${dateText(start)} – ${dateText(end.subtract(const Duration(days: 1)))}',
        ),
        const SizedBox(height: 12),
        if (scheduled.isEmpty)
          const Notice('Không có công việc được xếp lịch trong kỳ này.')
        else
          ...scheduled.map(
            (w) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: WorkCard(
                w,
                onTap: () => openPage(
                  context,
                  JobReadScreen(repo: widget.repo, id: w.id),
                ),
              ),
            ),
          ),
        const SectionTitle('Chưa xếp lịch'),
        if (unscheduled.isEmpty)
          const Notice('Không có công việc hiện tại chưa xếp lịch.')
        else
          ...unscheduled.map(
            (w) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: WorkCard(
                w,
                onTap: () => openPage(
                  context,
                  JobReadScreen(repo: widget.repo, id: w.id),
                ),
              ),
            ),
          ),
        const Text(
          'Lọc theo ngày bắt đầu dự kiến; đây chưa phải lịch hẹn đã xác nhận với khách hàng.',
          style: TextStyle(fontSize: 12, color: AppColors.muted),
        ),
      ],
    );
  }

  void _move(int amount) => setState(
    () => _date = _mode == 2
        ? DateTime.utc(_date.year, _date.month + amount)
        : _date.add(Duration(days: amount * (_mode == 1 ? 7 : 1))),
  );
}
