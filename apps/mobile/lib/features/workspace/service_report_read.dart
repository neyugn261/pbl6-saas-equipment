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
    builder: (r) {
      if (r == null) {
        return const Notice('Công việc chưa có báo cáo dịch vụ.');
      }
      final signOff = r['signOff'] as Map<String, dynamic>?;

      return Column(
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
              if (r['unresolvedReason'] != null)
                'Lý do chưa xử lý': r['unresolvedReason'],
              'Tóm tắt cho khách hàng': r['customerSummary'],
              'Nộp lúc': dateText(r['submittedAt'], time: true),
              'Mã báo cáo': r['id'],
            },
          ),
          if (signOff != null && signOff['status'] != null) ...[
            const SizedBox(height: 16),
            DataCard(
              'Xác nhận nghiệm thu hiện trường',
              fields: {
                'Trạng thái': label(signOff['status'].toString()),
                if (signOff['signerName'] != null)
                  'Người ký': signOff['signerName'],
                if (signOff['signerTitle'] != null)
                  'Chức vụ': signOff['signerTitle'],
                if (signOff['signerPhone'] != null)
                  'Số điện thoại': signOff['signerPhone'],
                if (signOff['signedAt'] != null)
                  'Thời điểm ký': dateText(signOff['signedAt'], time: true),
                if (signOff['notes'] != null)
                  'Ghi chú / Lý do': signOff['notes'],
              },
            ),
          ],
        ],
      );
    },
  );
}
