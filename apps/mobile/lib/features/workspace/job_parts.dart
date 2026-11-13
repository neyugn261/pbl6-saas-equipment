import 'package:flutter/material.dart';

import '../../ui/components.dart';
import '../../ui/theme.dart';
import 'part_request_dialogs.dart';
import 'part_request_models.dart';
import 'part_usage.dart';
import 'read_widgets.dart';
import 'workspace_repository.dart';

class JobParts extends StatefulWidget {
  const JobParts({
    super.key,
    required this.repo,
    required this.orderId,
    required this.revision,
    this.order,
  });

  final WorkspaceRepository repo;
  final String orderId;
  final int revision;
  final WorkOrder? order;

  @override
  State<JobParts> createState() => _JobPartsState();
}

class _JobPartsState extends State<JobParts> {
  int _subTab = 0; // 0: Linh kiện đã cấp, 1: Phiếu xin cấp, 2: Phiếu trả kho
  int _partRequestsRevision = 0;
  int _returnRequestsRevision = 0;

  // Search & filter state for subTab 0
  String _query = '';
  int _filter = 0;

  bool get _canRequestParts =>
      widget.order == null ||
      const ['ACCEPTED', 'TRAVELLING', 'IN_PROGRESS', 'ON_HOLD'].contains(
        widget.order?.status,
      );

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Wrap(
        alignment: WrapAlignment.spaceBetween,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 8,
        runSpacing: 8,
        children: [
          const SectionTitle('Phụ tùng & Linh kiện'),
          if (_canRequestParts)
            FilledButton.icon(
              key: const Key('request-parts-button'),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Xin cấp phụ tùng'),
              onPressed: () => CreatePartRequestSheet.show(
                context,
                repo: widget.repo,
                workOrderId: widget.orderId,
                onCreated: () => setState(() => _partRequestsRevision++),
              ),
            ),
        ],
      ),
      const SizedBox(height: 12),
      ChoicePills(
        labels: const ['Linh kiện đã cấp', 'Phiếu xin cấp', 'Phiếu trả kho'],
        selected: _subTab,
        onSelected: (i) => setState(() => _subTab = i),
      ),
      const SizedBox(height: 16),
      if (_subTab == 0) _buildIssuedParts(),
      if (_subTab == 1) _buildPartRequests(),
      if (_subTab == 2) _buildReturnRequests(),
    ],
  );

  Widget _buildIssuedParts() => ReadView<List<PartUsage>>(
    requestKey: '${widget.orderId}/${widget.revision}',
    load: () => widget.repo.workOrderParts(widget.orderId),
    builder: (items) {
      if (items.isEmpty) {
        return const Notice('Chưa có phụ tùng được cấp cho công việc này.');
      }
      final visible = items
          .where(
            (row) =>
                (_filter == 0 || row.unreconciled.positive) &&
                '${row.name ?? ''} ${row.sku ?? ''} ${row.warehouseName ?? ''} ${row.warehouseCode ?? ''}'
                    .toLowerCase()
                    .contains(_query.toLowerCase().trim()),
          )
          .toList();
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SectionTitle('Phụ tùng của công việc'),
          const Text(
            'Số đã cấp chưa trả gồm cả phần đã xác nhận dùng. Phần chưa đối soát chưa được coi là đã sử dụng.',
          ),
          const SizedBox(height: 16),
          TextField(
            key: const Key('parts-search'),
            decoration: const InputDecoration(
              labelText: 'Tìm mã, tên phụ tùng hoặc kho',
              prefixIcon: Icon(Icons.search),
            ),
            onChanged: (value) => setState(() => _query = value),
          ),
          const SizedBox(height: 12),
          ChoicePills(
            labels: const ['Tất cả', 'Chưa đối soát'],
            selected: _filter,
            onSelected: (i) => setState(() => _filter = i),
          ),
          const SizedBox(height: 12),
          Text('${visible.length}/${items.length} lượt cấp phụ tùng'),
          if (visible.isEmpty)
            const Notice('Không có phụ tùng phù hợp với bộ lọc.'),
          for (final item in visible)
            Card(
              child: ExpansionTile(
                key: ValueKey('part-usage-${item.id}'),
                title: Text(
                  item.name ?? 'Phụ tùng chưa có tên lưu tại lúc cấp',
                ),
                subtitle: Text(
                  '${item.sku ?? 'Chưa ghi nhận mã'} · ${item.warehouseName ?? 'Chưa ghi nhận kho'}',
                ),
                expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
                childrenPadding: const EdgeInsets.all(16),
                children: [
                  DataCard(
                    'Số lượng theo lần cấp',
                    fields: {
                      'Đơn vị': item.unit ?? 'Chưa ghi nhận',
                      'Đã cấp': item.issued.value,
                      'Đã trả': item.returned.value,
                      'Đã cấp chưa trả (gồm phần đã dùng)':
                          item.outstanding.value,
                      'Đã xác nhận dùng': item.confirmed.value,
                      'Chưa đối soát': item.unreconciled.value,
                      'Kho lúc cấp': item.warehouseName,
                      'Mã kho lúc cấp': item.warehouseCode,
                      'Ghi nhận cấp lúc': dateText(item.createdAt, time: true),
                    },
                  ),
                  if (item.unreconciled.positive) ...[
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      key: Key('return-part-${item.id}'),
                      icon: const Icon(Icons.assignment_return_outlined, size: 18),
                      label: const Text('Đề nghị trả kho'),
                      onPressed: () => CreateReturnRequestDialog.show(
                        context,
                        repo: widget.repo,
                        item: item,
                        onCreated: () => setState(() => _returnRequestsRevision++),
                      ),
                    ),
                  ],
                  if (item.incompleteHistory)
                    const Notice(
                      'Thông tin phụ tùng hoặc kho tại thời điểm cấp chưa được lưu đầy đủ. Số lượng vẫn là số liệu đã ghi nhận.',
                    ),
                  const SizedBox(height: 12),
                  const SectionTitle('Lịch sử trả về kho'),
                  if (item.returns.isEmpty)
                    const Text(
                      'Chưa có bản ghi trả kho liên kết với lượt cấp này.',
                    ),
                  for (final row in item.returns)
                    ListTile(
                      title: Text(
                        '${row.quantity.value} · ${switch (row.condition) {
                          'GOOD' => 'Tốt',
                          'DAMAGED' => 'Hư hỏng',
                          'PENDING_INSPECTION' => 'Chờ kiểm tra',
                          _ => 'Chưa ghi nhận tình trạng',
                        }}',
                      ),
                      subtitle: Text(dateText(row.createdAt, time: true)),
                    ),
                  if (item.returns.any(
                    (row) =>
                        row.condition == 'DAMAGED' ||
                        row.condition == 'PENDING_INSPECTION',
                  ))
                    const Text(
                      'Phụ tùng hư hỏng hoặc chờ kiểm tra được kho cách ly, chưa tính vào tồn sẵn sàng cấp.',
                    ),
                  if (item.incompleteReturnHistory)
                    const Notice(
                      'Lịch sử trả kho cũ chưa liên kết đầy đủ. Không cộng các dòng lịch sử để thay cho tổng đã trả ở trên.',
                    ),
                  const SizedBox(height: 12),
                  const SectionTitle('Lịch sử xác nhận sử dụng'),
                  if (item.confirmations.isEmpty)
                    const Text('Chưa có xác nhận sử dụng được ghi nhận.'),
                  for (final row in item.confirmations)
                    ListTile(
                      title: Text(
                        '${row.quantity.value} · ${row.kind == 'REVERSE'
                            ? 'Đính chính xác nhận'
                            : item.isReversed(row)
                            ? 'Xác nhận đã được đính chính'
                            : 'Xác nhận đã dùng'}',
                      ),
                      subtitle: Text(dateText(row.createdAt, time: true)),
                    ),
                ],
              ),
            ),
        ],
      );
    },
  );

  Widget _buildPartRequests() => ReadView<List<PartRequest>>(
    requestKey: '${widget.orderId}/part-requests/$_partRequestsRevision',
    load: () => widget.repo.listPartRequests(widget.orderId),
    builder: (requests) {
      if (requests.isEmpty) {
        return const Notice('Chưa có phiếu xin cấp phụ tùng nào cho công việc này.');
      }
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${requests.length} phiếu xin cấp phụ tùng',
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          for (final req in requests)
            Card(
              key: Key('part-request-${req.id}'),
              margin: const EdgeInsets.only(bottom: 12),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          req.requestNo,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                        ),
                        Wrap(
                          spacing: 6,
                          children: [
                            Pill(
                              label(req.status),
                              color: switch (req.status) {
                                'OPEN' => AppColors.peach,
                                'CLOSED' => AppColors.teal,
                                'CANCELLED' => AppColors.muted,
                                'REJECTED' => AppColors.berry,
                                _ => AppColors.muted,
                              },
                            ),
                            Pill(
                              label(req.fulfillmentStatus),
                              color: switch (req.fulfillmentStatus) {
                                'FULLY_ISSUED' => AppColors.teal,
                                'PARTIALLY_ISSUED' => AppColors.peach,
                                _ => AppColors.muted,
                              },
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text('Lý do: ${req.reason}', style: const TextStyle(fontSize: 14)),
                    const SizedBox(height: 4),
                    Text(
                      'Thời gian tạo: ${dateText(req.createdAt, time: true)}',
                      style: const TextStyle(color: AppColors.muted, fontSize: 12),
                    ),
                    if (req.lines.isNotEmpty) ...[
                      const Divider(height: 24),
                      const Text(
                        'Chi tiết linh kiện:',
                        style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                      ),
                      const SizedBox(height: 6),
                      for (final line in req.lines)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      line.name ?? line.sku ?? line.partId,
                                      style: const TextStyle(fontWeight: FontWeight.w500),
                                    ),
                                    if (line.sku != null)
                                      Text(
                                        'SKU: ${line.sku}',
                                        style: const TextStyle(
                                          color: AppColors.muted,
                                          fontSize: 12,
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                              Text(
                                'Đã cấp: ${line.quantityIssued} / ${line.quantityRequested} ${line.unit ?? ''}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                    if (req.canCancel) ...[
                      const SizedBox(height: 12),
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton.icon(
                          key: Key('cancel-part-request-${req.id}'),
                          icon: const Icon(
                            Icons.cancel_outlined,
                            color: AppColors.berry,
                            size: 18,
                          ),
                          label: const Text(
                            'Hủy phiếu',
                            style: TextStyle(color: AppColors.berry),
                          ),
                          onPressed: () => CancelPartRequestDialog.show(
                            context,
                            repo: widget.repo,
                            request: req,
                            onCancelled: () => setState(() => _partRequestsRevision++),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
        ],
      );
    },
  );

  Widget _buildReturnRequests() => ReadView<List<PartReturnRequest>>(
    requestKey: '${widget.orderId}/return-requests/$_returnRequestsRevision',
    load: () => widget.repo.listReturnRequests(widget.orderId),
    builder: (requests) {
      if (requests.isEmpty) {
        return const Notice('Chưa có đề nghị trả kho nào cho công việc này.');
      }
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${requests.length} đề nghị trả kho',
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          for (final req in requests)
            Card(
              key: Key('return-request-${req.id}'),
              margin: const EdgeInsets.only(bottom: 12),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          req.requestNo,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                        ),
                        Wrap(
                          spacing: 6,
                          children: [
                            Pill(
                              label(req.status),
                              color: switch (req.status) {
                                'OPEN' => AppColors.peach,
                                'CLOSED' => AppColors.teal,
                                'CANCELLED' => AppColors.muted,
                                _ => AppColors.muted,
                              },
                            ),
                            Pill(
                              label(req.receiptStatus),
                              color: switch (req.receiptStatus) {
                                'RECEIVED' => AppColors.teal,
                                'PARTIALLY_RECEIVED' => AppColors.peach,
                                _ => AppColors.muted,
                              },
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Linh kiện: ${req.partName ?? req.partSku ?? req.workOrderPartId}',
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                    if (req.partSku != null)
                      Text(
                        'Mã: ${req.partSku}',
                        style: const TextStyle(
                          color: AppColors.muted,
                          fontSize: 12,
                        ),
                      ),
                    const SizedBox(height: 6),
                    Text(
                      'Số lượng đề nghị: ${req.quantityRequested} ${req.partUnit ?? ''} (Đã nhận: ${req.quantityReceived})',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text('Lý do: ${req.reason}', style: const TextStyle(fontSize: 13)),
                    const SizedBox(height: 4),
                    Text(
                      'Thời gian tạo: ${dateText(req.createdAt, time: true)}',
                      style: const TextStyle(color: AppColors.muted, fontSize: 12),
                    ),
                    if (req.canCancel) ...[
                      const SizedBox(height: 12),
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton.icon(
                          key: Key('cancel-return-request-${req.id}'),
                          icon: const Icon(
                            Icons.cancel_outlined,
                            color: AppColors.berry,
                            size: 18,
                          ),
                          label: const Text(
                            'Hủy đề nghị',
                            style: TextStyle(color: AppColors.berry),
                          ),
                          onPressed: () => CancelReturnRequestDialog.show(
                            context,
                            repo: widget.repo,
                            request: req,
                            onCancelled: () => setState(() => _returnRequestsRevision++),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
        ],
      );
    },
  );
}
