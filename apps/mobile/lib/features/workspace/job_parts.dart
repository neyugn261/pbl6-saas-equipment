import 'package:flutter/material.dart';

import '../../ui/components.dart';
import 'part_usage.dart';
import 'read_widgets.dart';
import 'workspace_repository.dart';

class JobParts extends StatefulWidget {
  const JobParts({
    super.key,
    required this.repo,
    required this.orderId,
    required this.revision,
  });
  final WorkspaceRepository repo;
  final String orderId;
  final int revision;
  @override
  State<JobParts> createState() => _JobPartsState();
}

class _JobPartsState extends State<JobParts> {
  String _query = '';
  int _filter = 0;
  @override
  Widget build(BuildContext context) => ReadView<List<PartUsage>>(
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
}
