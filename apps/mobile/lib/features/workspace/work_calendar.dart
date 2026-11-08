import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../ui/components.dart';
import 'job_reads.dart';
import 'read_widgets.dart';
import 'workspace_repository.dart';

enum CalendarMode { day, week, month }

class CalendarSelection {
  CalendarSelection({DateTime? date}) : date = date ?? businessToday();
  DateTime date;
  CalendarMode mode = CalendarMode.day;
  bool history = false, wholePeriod = true;
}

/// Vietnam wall dates (UTC containers), with an exclusive end boundary.
class CalendarRange {
  CalendarRange(DateTime date, CalendarMode mode)
    : start = switch (mode) {
        CalendarMode.day => DateTime.utc(date.year, date.month, date.day),
        CalendarMode.week => DateTime.utc(
          date.year,
          date.month,
          date.day - date.weekday + 1,
        ),
        CalendarMode.month => DateTime.utc(date.year, date.month),
      },
      end = switch (mode) {
        CalendarMode.day => DateTime.utc(date.year, date.month, date.day + 1),
        CalendarMode.week => DateTime.utc(
          date.year,
          date.month,
          date.day - date.weekday + 8,
        ),
        CalendarMode.month => DateTime.utc(date.year, date.month + 1),
      };
  final DateTime start, end;
  bool contains(DateTime date) => !date.isBefore(start) && date.isBefore(end);
  static DateTime move(DateTime date, CalendarMode mode, int amount) {
    if (mode != CalendarMode.month) {
      return DateTime.utc(
        date.year,
        date.month,
        date.day + amount * (mode == CalendarMode.week ? 7 : 1),
      );
    }
    final first = DateTime.utc(date.year, date.month + amount);
    return DateTime.utc(
      first.year,
      first.month,
      math.min(date.day, DateTime.utc(first.year, first.month + 1, 0).day),
    );
  }
}

class WorkCalendar extends StatefulWidget {
  const WorkCalendar({
    super.key,
    required this.work,
    required this.repo,
    this.selection,
  });
  final PersonalWork work;
  final WorkspaceRepository repo;
  final CalendarSelection? selection;
  @override
  State<WorkCalendar> createState() => _WorkCalendarState();
}

class _WorkCalendarState extends State<WorkCalendar> {
  late final CalendarSelection view = widget.selection ?? CalendarSelection();
  @override
  Widget build(BuildContext context) {
    final range = CalendarRange(view.date, view.mode);
    final source = view.history ? widget.work.orders : widget.work.current;
    final scheduled =
        source
            .where((w) => w.start != null && range.contains(w.start!))
            .toList()
          ..sort((a, b) {
            final c = a.start!.compareTo(b.start!);
            return c != 0 ? c : a.number.compareTo(b.number);
          });
    final agenda = view.mode == CalendarMode.day || view.wholePeriod
        ? scheduled
        : scheduled.where((w) => sameDate(w.start!, view.date)).toList();
    final unscheduled = widget.work.current
        .where((w) => w.start == null)
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ChoicePills(
          labels: const ['Ngày', 'Tuần', 'Tháng'],
          selected: view.mode.index,
          onSelected: (i) => setState(() {
            view.mode = CalendarMode.values[i];
            view.wholePeriod = true;
          }),
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
                key: const Key('calendar-date'),
                onPressed: _chooseDate,
                child: Text(
                  view.mode == CalendarMode.month
                      ? '${view.date.month}/${view.date.year}'
                      : dateText(view.date),
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
        Align(
          alignment: Alignment.center,
          child: TextButton(
            key: const Key('calendar-today'),
            onPressed: () => setState(() {
              view.date = businessToday();
              view.wholePeriod = true;
            }),
            child: const Text('Hôm nay'),
          ),
        ),
        if (view.mode != CalendarMode.day) ...[
          Row(
            children: [
              for (final day in const [
                'T2',
                'T3',
                'T4',
                'T5',
                'T6',
                'T7',
                'CN',
              ])
                Expanded(
                  child: Text(
                    day,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          _days(range, scheduled),
        ],
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Bao gồm lịch sử cá nhân'),
          value: view.history,
          onChanged: (v) => setState(() => view.history = v),
        ),
        Text(
          '${dateText(range.start)} – ${dateText(range.end.subtract(const Duration(days: 1)))}',
          key: const Key('calendar-range'),
        ),
        const SizedBox(height: 8),
        const Text(
          'Lịch dự kiến theo ngày bắt đầu · Giờ Việt Nam (UTC+7). Chưa phải lịch hẹn đã xác nhận với khách hàng.',
        ),
        if (view.mode != CalendarMode.day && !view.wholePeriod)
          TextButton(
            onPressed: () => setState(() => view.wholePeriod = true),
            child: Text(
              view.mode == CalendarMode.week ? 'Xem cả tuần' : 'Xem cả tháng',
            ),
          ),
        const SizedBox(height: 12),
        Text(
          view.mode != CalendarMode.day && view.wholePeriod
              ? 'Công việc trong kỳ · ${agenda.length}'
              : 'Công việc ngày ${dateText(view.date)} · ${agenda.length}',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        if (agenda.isEmpty)
          const Notice(
            'Không có công việc được xếp lịch trong khoảng đang xem.',
          )
        else
          for (var i = 0; i < agenda.length; i++) ...[
            if (i == 0 || !sameDate(agenda[i - 1].start!, agenda[i].start!))
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  dateText(agenda[i].start),
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: WorkCard(
                agenda[i],
                onTap: () => openPage(
                  context,
                  JobReadScreen(repo: widget.repo, id: agenda[i].id),
                ),
              ),
            ),
          ],
        const SectionTitle('Hiện tại chưa xếp lịch'),
        if (unscheduled.isEmpty)
          const Notice('Không có công việc hiện tại chưa xếp lịch.')
        else
          for (final w in unscheduled)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: WorkCard(
                w,
                onTap: () => openPage(
                  context,
                  JobReadScreen(repo: widget.repo, id: w.id),
                ),
              ),
            ),
      ],
    );
  }

  Widget _days(CalendarRange range, List<WorkOrder> scheduled) {
    final offset = range.start.weekday - 1;
    final count = range.end.difference(range.start).inDays;
    final cells = ((offset + count) / 7).ceil() * 7;
    final scheme = Theme.of(context).colorScheme;
    return Column(
      children: [
        for (var row = 0; row < cells ~/ 7; row++)
          Row(
            children: [
              for (var col = 0; col < 7; col++)
                Expanded(
                  child: Builder(
                    builder: (context) {
                      final index = row * 7 + col - offset;
                      if (index < 0 || index >= count) {
                        return const SizedBox(height: 72);
                      }
                      final d = range.start.add(Duration(days: index));
                      final n = scheduled
                          .where((w) => sameDate(w.start!, d))
                          .length;
                      final selected = sameDate(d, view.date);
                      return Padding(
                        padding: const EdgeInsets.all(1),
                        child: Semantics(
                          label: '${dateText(d)} · $n công việc',
                          selected: selected,
                          button: true,
                          child: Tooltip(
                            message: '${dateText(d)} · $n công việc',
                            child: Material(
                              color: selected
                                  ? scheme.primaryContainer
                                  : scheme.surfaceContainerLow,
                              borderRadius: BorderRadius.circular(12),
                              child: InkWell(
                                key: Key(
                                  'calendar-day-${d.toIso8601String().substring(0, 10)}',
                                ),
                                borderRadius: BorderRadius.circular(12),
                                onTap: () => setState(() {
                                  view.date = d;
                                  view.wholePeriod = false;
                                }),
                                child: SizedBox(
                                  height: 72,
                                  child: ExcludeSemantics(
                                    child: Column(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        Text(
                                          '${d.day}',
                                          style: TextStyle(
                                            fontSize: 14,
                                            fontWeight: selected
                                                ? FontWeight.bold
                                                : FontWeight.normal,
                                            color: selected
                                                ? scheme.onPrimaryContainer
                                                : scheme.onSurface,
                                          ),
                                        ),
                                        Text(
                                          n == 0 ? '–' : '$n',
                                          style: TextStyle(
                                            fontSize: 10,
                                            color: selected
                                                ? scheme.onPrimaryContainer
                                                : scheme.onSurfaceVariant,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
            ],
          ),
      ],
    );
  }

  Future<void> _chooseDate() async {
    final date = view.date;
    final selected = await showDatePicker(
      context: context,
      initialDate: DateTime(date.year, date.month, date.day),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100, 12, 31),
    );
    if (mounted && selected != null) {
      setState(() {
        view.date = DateTime.utc(selected.year, selected.month, selected.day);
        view.wholePeriod = false;
      });
    }
  }

  void _move(int amount) => setState(() {
    final next = CalendarRange.move(view.date, view.mode, amount);
    if (next.year >= 2000 && next.year <= 2100) {
      view.date = next;
      view.wholePeriod = true;
    }
  });
}
