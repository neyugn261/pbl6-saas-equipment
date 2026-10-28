import 'package:flutter/material.dart';

import '../../core/api/api_exception.dart';
import 'read_widgets.dart';
import 'workspace_repository.dart';

class ServiceReportRead extends StatelessWidget {
  const ServiceReportRead({
    super.key,
    required this.repo,
    required this.workOrderId,
    this.revision = 0,
  });
  final WorkspaceRepository repo;
  final String workOrderId;
  final int revision;
  Future<Json?> _load() async {
    try {
      return await repo.get(
        '${WorkspaceRepository.wo}/work-orders/$workOrderId/service-report',
      );
    } on ApiException catch (e) {
      if (e.status == 404 && e.code == 'SERVICE_REPORT_NOT_FOUND') return null;
      rethrow;
    }
  }

  @override
  Widget build(BuildContext context) => ReadView<Json?>(
    requestKey: revision,
    load: _load,
    builder: (r) => r == null
        ? const Notice('Công việc chưa có báo cáo dịch vụ.')
        : Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              statusPill(text(r, 'result')),
              const SizedBox(height: 16),
              DataCard(
                'Báo cáo dịch vụ',
                fields: {
                  'Vấn đề': r['problemDescription'],
                  'Nguyên nhân': r['rootCause'],
                  'Giải pháp': r['solution'],
                  'Tóm tắt cho khách hàng': r['customerSummary'],
                  'Nộp lúc': dateText(r['submittedAt'], time: true),
                  'Mã báo cáo': r['id'],
                },
              ),
            ],
          ),
  );
}
