import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../ui/components.dart';
import 'job_reads.dart';
import 'read_widgets.dart';
import 'workspace_repository.dart';

/// Owned by the signed-in workspace, survives read errors/loading, never logout.
class JobFilters {
  String query = '', status = '', type = '', priority = '';
  bool history = false, completedToday = false;
  int page = 1;
  DateTimeRange? dates;
  void shortcut(String stage) {
    query = '';
    type = '';
    priority = '';
    dates = null;
    page = 1;
    completedToday = stage == 'COMPLETED_TODAY';
    status = completedToday ? 'COMPLETED' : stage;
    history = status == 'COMPLETED';
  }
}

class PersonalJobs extends StatefulWidget {
  const PersonalJobs({
    super.key,
    required this.work,
    required this.repo,
    this.initialStage = '',
    this.filters,
  });
  final PersonalWork work;
  final WorkspaceRepository repo;
  final String initialStage;
  final JobFilters? filters;
  @override
  State<PersonalJobs> createState() => _PersonalJobsState();
}

class _PersonalJobsState extends State<PersonalJobs> {
  late final JobFilters _filter;
  late final TextEditingController _search;
  @override
  void initState() {
    super.initState();
    _filter = widget.filters ?? (JobFilters()..shortcut(widget.initialStage));
    _search = TextEditingController(text: _filter.query);
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant PersonalJobs old) {
    super.didUpdateWidget(old);
    if (widget.filters == null && old.initialStage != widget.initialStage) {
      _filter.shortcut(widget.initialStage);
    }
    if (_search.text != _filter.query) _search.text = _filter.query;
  }

  @override
  Widget build(BuildContext context) {
    final data =
        (_filter.history ? widget.work.history : widget.work.current).where((
          w,
        ) {
          final q = _filter.query.trim().toLowerCase();
          final d = w.start;
          return (q.isEmpty ||
                  '${w.number} ${w.title}'.toLowerCase().contains(q)) &&
              (_filter.status.isEmpty ||
                  _filter.status.split(',').contains(w.status)) &&
              (!_filter.completedToday ||
                  wallTime(w.data['completedAt']) != null &&
                      sameDate(
                        wallTime(w.data['completedAt'])!,
                        businessToday(),
                      )) &&
              (_filter.type.isEmpty || w.data['type'] == _filter.type) &&
              (_filter.priority.isEmpty ||
                  w.data['priority'] == _filter.priority) &&
              (_filter.dates == null ||
                  d != null &&
                      !d.isBefore(_filter.dates!.start) &&
                      d.isBefore(
                        _filter.dates!.end.add(const Duration(days: 1)),
                      ));
        }).toList()..sort(
          (a, b) => text(
            b.data,
            'createdAt',
            '',
          ).compareTo(text(a.data, 'createdAt', '')),
        );
    _filter.page = _filter.page.clamp(
      1,
      math.max(1, (data.length / 20).ceil()),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ChoicePills(
          labels: const ['Hiện tại', 'Lịch sử'],
          selected: _filter.history ? 1 : 0,
          onSelected: (i) => setState(() {
            _filter.history = i == 1;
            _filter.completedToday = false;
            _filter.status = '';
            _filter.page = 1;
          }),
        ),
        const SizedBox(height: 16),
        if (_filter.completedToday)
          TextButton(
            onPressed: () => setState(() => _filter.completedToday = false),
            child: const Text('Hoàn thành hôm nay · Bỏ lọc ngày hoàn thành'),
          ),
        TextField(
          key: const Key('jobs-search'),
          controller: _search,
          maxLength: 100,
          decoration: const InputDecoration(
            hintText: 'Mã WO hoặc tiêu đề',
            prefixIcon: Icon(Icons.search),
            counterText: '',
          ),
          onChanged: (v) => setState(() {
            _filter.query = v;
            _filter.page = 1;
          }),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _dropdown('Trạng thái', _filter.status, const [
              'CREATED',
              'IN_PROGRESS,TRAVELLING',
              'ASSIGNED',
              'ACCEPTED',
              'TRAVELLING',
              'IN_PROGRESS',
              'ON_HOLD',
              'COMPLETED',
              'CANCELLED',
            ], (v) => _filter.status = v),
            _dropdown('Loại', _filter.type, const [
              'REPAIR',
              'WARRANTY',
              'MAINTENANCE',
              'INSPECTION',
            ], (v) => _filter.type = v),
            _dropdown('Ưu tiên', _filter.priority, const [
              'LOW',
              'NORMAL',
              'HIGH',
              'URGENT',
            ], (v) => _filter.priority = v),
            OutlinedButton.icon(
              icon: const Icon(Icons.date_range),
              label: Text(
                _filter.dates == null
                    ? 'Khoảng lịch'
                    : '${dateText(_filter.dates!.start)} – ${dateText(_filter.dates!.end)}',
              ),
              onPressed: () async {
                final now = businessToday();
                final selected = await showDateRangePicker(
                  context: context,
                  initialDateRange: _filter.dates,
                  firstDate: DateTime(now.year - 10),
                  lastDate: DateTime(now.year + 10),
                );
                if (mounted && selected != null) {
                  setState(() {
                    _filter.dates = DateTimeRange(
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
                    _filter.page = 1;
                  });
                }
              },
            ),
            if (_filter.dates != null)
              TextButton(
                onPressed: () => setState(() {
                  _filter.dates = null;
                  _filter.page = 1;
                }),
                child: const Text('Bỏ ngày'),
              ),
          ],
        ),
        const SizedBox(height: 16),
        Text(
          _filter.history
              ? 'Các công việc từng được phân công, hiện không còn là phân công của bạn (bao gồm hoàn thành, hủy, từ chối hoặc gỡ phân công).'
              : 'Chỉ công việc đang được phân công cho tài khoản này.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 16),
        if (data.isEmpty)
          const Notice('Không có công việc phù hợp.')
        else
          ...data
              .skip((_filter.page - 1) * 20)
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
          page: _filter.page,
          total: data.length,
          pageSize: 20,
          onPage: (p) => setState(() => _filter.page = p),
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
        _filter.page = 1;
      }),
    ),
  );
}
