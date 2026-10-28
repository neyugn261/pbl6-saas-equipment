import 'dart:async';

import 'package:flutter/material.dart';

import '../../ui/components.dart';
import '../../ui/theme.dart';
import 'equipment_reads.dart';
import 'job_actions.dart';
import 'work_order_workflow.dart';
import 'service_report_read.dart';
export 'service_report_read.dart';
import 'read_widgets.dart';
import 'workspace_repository.dart';

class JobReadScreen extends StatefulWidget {
  const JobReadScreen({super.key, required this.repo, required this.id});
  final WorkspaceRepository repo;
  final String id;
  @override
  State<JobReadScreen> createState() => _JobReadScreenState();
}

class _JobReadScreenState extends State<JobReadScreen>
    with WidgetsBindingObserver {
  int _tab = 0;
  late final WorkOrderWorkflow workflow;
  int get _revision => workflow.revision;
  WorkspaceRepository get repo => widget.repo;
  String get base => '${WorkspaceRepository.wo}/work-orders/${widget.id}';
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    workflow = WorkOrderWorkflow(repo, widget.id);
    unawaited(workflow.load());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    workflow.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) {
      unawaited(workflow.load());
    }
  }

  Future<void> _refresh() => workflow.load();
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: workflow,
    builder: (context, _) => PopScope(
      canPop: !workflow.busy,
      child: ReadPage(
        title: 'Chi tiết công việc',
        actions: [
          IconButton(
            tooltip: 'Tải lại',
            onPressed: workflow.busy ? null : _refresh,
            icon: const Icon(Icons.refresh),
          ),
        ],
        bottom: WorkOrderActionBar(
          workflow: workflow,
          onReportClosed: () => setState(() => _tab = 2),
        ),
        child: ReadList(
          refresh: _refresh,
          children: [
            if (workflow.notice != null) Notice(workflow.notice!),
            if (workflow.loading)
              const Center(child: CircularProgressIndicator())
            else if (workflow.order == null)
              Notice(
                workflow.loadError?.userMessage ?? 'Không đọc được công việc.',
                action: TextButton(
                  onPressed: _refresh,
                  child: const Text('Thử lại'),
                ),
              )
            else
              _detail(workflow.order!),
          ],
        ),
      ),
    ),
  );
  Widget _detail(WorkOrder w) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      PageHeading(w.number, subtitle: w.title),
      const SizedBox(height: 16),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          statusPill(w.status),
          Pill(label(text(w.data, 'priority')), color: AppColors.muted),
        ],
      ),
      const SizedBox(height: 20),
      ChoicePills(
        labels: const ['Tổng quan', 'Hoạt động', 'Báo cáo', 'Tệp', 'Phụ tùng'],
        selected: _tab,
        onSelected: (i) => setState(() => _tab = i),
      ),
      const SizedBox(height: 20),
      if (_tab == 0) ..._overview(w),
      if (_tab == 1) ...[
        const SectionTitle('Lịch sử trạng thái'),
        _feed('history', 'status'),
        const SectionTitle('Lịch sử phân công'),
        _feed('assignments', 'assignment'),
        const SectionTitle('Nhật ký thực hiện'),
        _feed('logs', 'log'),
      ],
      if (_tab == 2)
        ServiceReportRead(repo: repo, workOrderId: w.id, revision: _revision),
      if (_tab == 3)
        const Notice(
          'Tệp đính kèm chờ backend M3. Chưa có danh sách tệp thật.',
        ),
      if (_tab == 4)
        const Notice(
          'Phụ tùng chờ Inventory M3. Chưa có dữ liệu xuất kho thật.',
        ),
      const SizedBox(height: 20),
      if (w.terminal)
        const Notice('Công việc đã kết thúc. Chỉ xem dữ liệu và báo cáo.')
      else if (!w.currentFor(repo.user.id))
        const Notice(
          'Bạn không còn được phân công hiện tại. Chỉ xem lịch sử công việc.',
        ),
    ],
  );
  List<Widget> _overview(WorkOrder w) => [
    DataCard(
      'Thông tin công việc',
      fields: {
        'Loại': label(text(w.data, 'type')),
        'Mô tả': w.data['description'],
        'Nguồn': w.data['serviceRequestId'] != null
            ? 'Yêu cầu dịch vụ'
            : w.data['maintenanceTaskId'] != null
            ? 'Tác vụ bảo trì'
            : 'Chưa ghi nhận',
        'Bắt đầu dự kiến': w.start == null
            ? 'Chưa xếp lịch'
            : dateText(w.start, time: true),
        'Kết thúc dự kiến': w.end == null
            ? 'Chưa xếp lịch'
            : dateText(w.end, time: true),
        'Bắt đầu thực hiện': dateText(w.data['startedAt'], time: true),
        'Hoàn thành': dateText(w.data['completedAt'], time: true),
        'Hủy': dateText(w.data['cancelledAt'], time: true),
      },
    ),
    const SizedBox(height: 16),
    ReadView<Json>(
      requestKey: _revision,
      load: () => repo.dossier(w.equipmentId),
      builder: (d) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          EquipmentSummary(
            equipment: Equipment(object(d['equipment'])),
            onTap: () => openPage(
              context,
              EquipmentReadScreen(repo: repo, id: w.equipmentId),
            ),
          ),
          const SizedBox(height: 16),
          OrganizationSections(dossier: d),
        ],
      ),
    ),
    const SizedBox(height: 16),
    if (w.data['serviceRequestId'] != null)
      OutlinedButton.icon(
        onPressed: () => openPage(
          context,
          RequestReadScreen(
            repo: repo,
            equipmentId: w.equipmentId,
            id: text(w.data, 'serviceRequestId'),
          ),
        ),
        icon: const Icon(Icons.description_outlined),
        label: const Text('Xem yêu cầu dịch vụ nguồn'),
      ),
    if (w.data['maintenanceTaskId'] != null)
      DataCard(
        'Nguồn bảo trì',
        fields: {
          'Mã tham chiếu Task': w.data['maintenanceTaskId'],
          'Quyền truy cập': 'Hồ sơ bảo trì chi tiết yêu cầu maintenance:read.',
        },
      ),
    const SizedBox(height: 16),
    DataCard(
      'Phân công hiện tại',
      fields: nested(w.data, 'currentAssignment').isEmpty
          ? {'Phân công': 'Không còn phân công hiện tại'}
          : {
              'Kỹ thuật viên': actor(
                text(nested(w.data, 'currentAssignment'), 'technicianUserId'),
                repo,
              ),
              'Trạng thái': label(
                text(nested(w.data, 'currentAssignment'), 'status'),
              ),
              'Ngày phân công': dateText(
                nested(w.data, 'currentAssignment')['assignedAt'],
                time: true,
              ),
            },
    ),
  ];
  Widget _feed(String part, String kind) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: ReadView<List<Json>>(
      requestKey: _revision,
      load: () => repo.list('$base/$part'),
      builder: (data) => EventRecords(records: data, kind: kind, repo: repo),
    ),
  );
}

String actor(String id, WorkspaceRepository repo) => id == repo.user.id
    ? '${repo.user.fullName} (bạn)'
    : id == 'Chưa ghi nhận' || id.isEmpty
    ? 'Chưa ghi nhận người thực hiện'
    : 'Người dùng · $id';

class EventRecords extends StatelessWidget {
  const EventRecords({
    super.key,
    required this.records,
    required this.kind,
    required this.repo,
  });
  final List<Json> records;
  final String kind;
  final WorkspaceRepository repo;
  @override
  Widget build(BuildContext context) => records.isEmpty
      ? const Notice('Chưa có bản ghi.')
      : Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final row in records)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: DataCard(
                  kind == 'status' && row['kind'] != 'COMMENT_ADDED'
                      ? '${label(text(row, 'oldStatus', 'Bắt đầu'))} → ${label(text(row, 'newStatus'))}'
                      : kind == 'assignment'
                      ? label(text(row, 'status'))
                      : label(
                          text(
                            row,
                            'eventType',
                            text(row, 'kind', text(row, 'title', 'Bản ghi')),
                          ),
                        ),
                  fields: switch (row['kind'] == 'COMMENT_ADDED'
                      ? 'comment'
                      : kind) {
                    'status' => {
                      'Thời gian': dateText(row['changedAt'], time: true),
                      'Người thực hiện': actor(text(row, 'changedBy'), repo),
                      'Lý do': row['reason'],
                    },
                    'assignment' => {
                      'Kỹ thuật viên': actor(
                        text(row, 'technicianUserId'),
                        repo,
                      ),
                      'Người phân công': actor(text(row, 'assignedBy'), repo),
                      'Phân công': dateText(row['assignedAt'], time: true),
                      'Tiếp nhận': dateText(row['acceptedAt'], time: true),
                      'Từ chối': dateText(row['rejectedAt'], time: true),
                      'Gỡ phân công': dateText(row['unassignedAt'], time: true),
                      'Lý do từ chối': row['rejectionReason'],
                    },
                    'log' => {
                      'Thời gian': dateText(row['createdAt'], time: true),
                      'Người ghi': actor(text(row, 'actorUserId'), repo),
                      'Nội dung': row['note'],
                    },
                    'comment' => {
                      'Thời gian': dateText(
                        row['createdAt'] ?? row['occurredAt'],
                        time: true,
                      ),
                      'Người ghi': actor(text(row, 'authorUserId'), repo),
                      'Nội dung': row['content'] ?? row['body'],
                    },
                    _ => {
                      'Thời gian': dateText(
                        row['occurredAt'] ?? row['createdAt'],
                        time: true,
                      ),
                      'Mô tả': row['description'],
                      'Ghi chú': row['customerNote'],
                    },
                  },
                ),
              ),
          ],
        );
}

class RequestReadScreen extends StatefulWidget {
  const RequestReadScreen({
    super.key,
    required this.repo,
    required this.equipmentId,
    required this.id,
  });
  final WorkspaceRepository repo;
  final String equipmentId, id;
  @override
  State<RequestReadScreen> createState() => _RequestReadScreenState();
}

class _RequestReadScreenState extends State<RequestReadScreen> {
  int _revision = 0;
  @override
  Widget build(BuildContext context) => ReadPage(
    title: 'Yêu cầu dịch vụ',
    child: ReadList(
      refresh: () async => setState(() => _revision++),
      children: [
        ReadView<Json>(
          requestKey: _revision,
          load: () => widget.repo.get(
            '${WorkspaceRepository.asset}/equipment/${widget.equipmentId}/service-requests/${widget.id}',
          ),
          builder: (section) => SectionView(
            section: section,
            builder: (value) {
              final data = object(value),
                  r = nested(data, 'request'),
                  warranty = nested(data, 'warrantyCheck');
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  PageHeading(text(r, 'requestNo'), subtitle: text(r, 'title')),
                  const SizedBox(height: 16),
                  statusPill(text(r, 'status')),
                  const SizedBox(height: 16),
                  DataCard(
                    'Yêu cầu',
                    fields: {
                      'Mô tả': r['description'],
                      'Loại': label(text(r, 'type')),
                      'Ưu tiên': label(text(r, 'priority')),
                      'Kết quả': r['resolutionResult'] == null
                          ? null
                          : label(text(r, 'resolutionResult')),
                      'Tóm tắt xử lý': r['resolutionSummary'],
                      'Ngày tạo': dateText(r['createdAt'], time: true),
                    },
                  ),
                  const SizedBox(height: 16),
                  DataCard(
                    'Kết luận bảo hành tại lần duyệt yêu cầu',
                    fields: {
                      'Kết luận': warranty['result'] == null
                          ? null
                          : label(text(warranty, 'result')),
                      'Mã bảo hành': warranty['warrantyId'],
                      'Kết thúc bảo hành lúc duyệt': dateText(
                        warranty['warrantyEndDate'],
                      ),
                      'Kiểm tra lúc': dateText(
                        warranty['checkedAt'],
                        time: true,
                      ),
                      'Người kiểm tra': actor(
                        text(warranty, 'checkedBy'),
                        widget.repo,
                      ),
                      'Ý nghĩa': 'Đây là snapshot xét yêu cầu, khác với bảo hành theo ngày hiện tại của thiết bị.',
                    },
                  ),
                  const SectionTitle('Lịch sử yêu cầu'),
                  SectionView(
                    section: nested(data, 'history'),
                    builder: (v) => EventRecords(
                      records: rows(v),
                      kind: 'status',
                      repo: widget.repo,
                    ),
                  ),
                  const SectionTitle('Trao đổi'),
                  SectionView(
                    section: nested(data, 'comments'),
                    builder: (v) => EventRecords(
                      records: rows(v),
                      kind: 'comment',
                      repo: widget.repo,
                    ),
                  ),
                  const SectionTitle('Ước tính chi phí'),
                  SectionView(
                    section: nested(data, 'estimates'),
                    builder: (v) {
                      final estimates = rows(v);
                      return estimates.isEmpty
                          ? const Notice('Chưa có ước tính chi phí.')
                          : Column(
                              children: [
                                for (final e in estimates)
                                  DataCard(
                                    'Ước tính · Lần ${e['revisionNo']}',
                                    fields: {
                                      'Trạng thái': label(text(e, 'status')),
                                      'Chi phí':
                                          '${e['totalAmount']} ${text(e, 'currency', '')}',
                                      'Có hiệu lực đến': dateText(
                                        e['validUntil'],
                                      ),
                                      'Ghi chú': e['notes'],
                                      for (final item in rows(e['items']))
                                        text(
                                          item,
                                          'description',
                                        ): '${item['quantity']} × ${item['unitPrice']} = ${item['amount']}',
                                    },
                                  ),
                              ],
                            );
                    },
                  ),
                ],
              );
            },
          ),
        ),
      ],
    ),
  );
}
