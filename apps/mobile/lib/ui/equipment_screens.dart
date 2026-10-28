import 'package:flutter/material.dart';

import 'components.dart';
import 'job_detail_screen.dart';
import 'preview_data.dart';
import 'theme.dart';

class EquipmentScreen extends StatefulWidget {
  // TODO(mobile-asset): public list/dossier/timeline and scoped related WO APIs;
  // keep restricted/unavailable sections distinct from empty data.
  const EquipmentScreen({super.key});
  @override
  State<EquipmentScreen> createState() => _EquipmentScreenState();
}

class _EquipmentScreenState extends State<EquipmentScreen> {
  String _query = '';
  int _filter = 0;
  @override
  Widget build(BuildContext context) {
    final equipment = PreviewData.equipment
        .where(
          (e) =>
              '${e.id} ${e.serial} ${e.model} ${e.name}'.toLowerCase().contains(
                _query.toLowerCase(),
              ) &&
              (_filter == 0 || (_filter == 1 ? e.inWarranty : !e.inWarranty)),
        )
        .toList();
    return ListView(
      key: const PageStorageKey('equipment-scroll'),
      padding: const EdgeInsets.fromLTRB(22, 22, 22, 28),
      children: [
        const PreviewTag(),
        const SizedBox(height: 14),
        PageHeading(
          'Thiết bị',
          subtitle: 'Hiểu thiết bị. Chủ động xử lý.',
          action: RoundIcon(
            Icons.qr_code_scanner_rounded,
            label: 'Quét QR thiết bị',
            onTap: () => openPage(context, const QrPreviewScreen()),
          ),
        ),
        const SizedBox(height: 24),
        TextField(
          onChanged: (v) => setState(() => _query = v),
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.search_rounded, color: AppColors.muted),
            hintText: 'Mã thiết bị, serial hoặc model',
          ),
        ),
        const SizedBox(height: 18),
        ChoicePills(
          labels: const ['Tất cả', 'Còn bảo hành', 'Hết bảo hành'],
          selected: _filter,
          onSelected: (i) => setState(() => _filter = i),
        ),
        const SizedBox(height: 20),
        Text(
          '${equipment.length} thiết bị trong phạm vi tra cứu',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 14),
        if (equipment.isEmpty)
          const StatePanel(
            title: 'Chưa tìm thấy thiết bị',
            message: 'Kiểm tra lại mã, serial hoặc tên model.',
            icon: Icons.search_off_rounded,
          ),
        for (final item in equipment)
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: SoftCard(
              onTap: () =>
                  openPage(context, EquipmentDetailScreen(equipment: item)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          color: item.color.withValues(alpha: .12),
                          borderRadius: BorderRadius.circular(18),
                        ),
                        child: Icon(item.icon, size: 29, color: item.color),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.name,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              item.id,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                      const Icon(
                        Icons.north_east_rounded,
                        size: 18,
                        color: AppColors.muted,
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  Text(
                    item.model,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    item.customer,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      Pill(
                        item.inWarranty ? 'Còn bảo hành' : 'Hết bảo hành',
                        color: item.inWarranty
                            ? AppColors.teal
                            : AppColors.berry,
                      ),
                      Pill(
                        item.condition,
                        color: item.condition == 'Hoạt động bình thường'
                            ? AppColors.teal
                            : const Color(0xffae7a37),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class EquipmentDetailScreen extends StatefulWidget {
  const EquipmentDetailScreen({super.key, required this.equipment});
  final EquipmentPreview equipment;
  @override
  State<EquipmentDetailScreen> createState() => _EquipmentDetailScreenState();
}

class _EquipmentDetailScreenState extends State<EquipmentDetailScreen> {
  int _tab = 0;
  @override
  Widget build(BuildContext context) {
    final e = widget.equipment;
    return UiPage(
      title: 'Hồ sơ thiết bị',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(22, 18, 22, 28),
        children: [
          EquipmentArt(e),
          const SizedBox(height: 22),
          Text(e.id, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 7),
          Text(e.name, style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 5),
          Text(e.model, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              Pill(e.condition),
              Pill(
                e.inWarranty ? 'Còn bảo hành' : 'Hết bảo hành',
                color: e.inWarranty ? AppColors.teal : AppColors.berry,
              ),
            ],
          ),
          const SizedBox(height: 24),
          ChoicePills(
            labels: const ['Tổng quan', 'Thông số', 'Bảo hành', 'Lịch sử'],
            selected: _tab,
            onSelected: (i) => setState(() => _tab = i),
          ),
          const SizedBox(height: 20),
          if (_tab == 0) ...[
            SoftCard(
              child: Column(
                children: [
                  InfoRow(Icons.business_outlined, 'Khách hàng', e.customer),
                  InfoRow(Icons.location_on_outlined, 'Địa điểm', e.site),
                  InfoRow(
                    Icons.map_outlined,
                    'Địa chỉ',
                    e.address,
                    onTap: () => previewAction(context, 'Sao chép địa chỉ'),
                  ),
                  InfoRow(
                    Icons.phone_outlined,
                    'Liên hệ kỹ thuật',
                    'Anh Minh · 0900 000 123',
                    onTap: () => previewAction(context, 'Mở trình quay số'),
                  ),
                ],
              ),
            ),
            const SectionTitle('Thông tin thiết bị'),
            SoftCard(
              child: Column(
                children: [
                  InfoRow(Icons.tag_rounded, 'Số serial', e.serial),
                  const InfoRow(
                    Icons.event_available_outlined,
                    'Ngày bàn giao',
                    '15/06/2024',
                  ),
                  const InfoRow(
                    Icons.apartment_outlined,
                    'Vị trí',
                    'Tầng 2 · Khu kỹ thuật',
                  ),
                ],
              ),
            ),
            const SectionTitle('Công việc liên quan'),
            for (final j in PreviewData.jobs.where(
              (j) => j.equipment.id == e.id,
            ))
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: JobCard(
                  job: j,
                  onTap: () => openPage(context, JobDetailScreen(job: j)),
                ),
              ),
            const SectionTitle('Bảo trì định kỳ'),
            const SoftCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.lock_outline_rounded, color: AppColors.muted),
                  SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Nội dung theo quyền truy cập',
                          style: TextStyle(fontWeight: FontWeight.w500),
                        ),
                        SizedBox(height: 5),
                        Text(
                          'Kế hoạch bảo trì được quản lý bởi bộ phận điều phối. Công việc đã giao vẫn hiển thị trong My Jobs.',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (_tab == 1) ...[
            SoftCard(
              child: Column(
                children: [
                  InfoRow(
                    Icons.precision_manufacturing_outlined,
                    'Model',
                    e.model,
                  ),
                  InfoRow(Icons.numbers_rounded, 'Serial', e.serial),
                  const InfoRow(
                    Icons.electrical_services_outlined,
                    'Nguồn điện',
                    '220 V / 50 Hz',
                  ),
                  const InfoRow(
                    Icons.inventory_2_outlined,
                    'Phân loại',
                    'Thiết bị chuyên dụng',
                  ),
                  const InfoRow(
                    Icons.info_outline_rounded,
                    'Hồ sơ kỹ thuật',
                    'Thông số minh họa · Chờ dữ liệu thiết bị',
                  ),
                ],
              ),
            ),
          ],
          if (_tab == 2) ...[
            SoftCard(
              color: e.inWarranty ? AppColors.paleTeal : AppColors.paleBerry,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.verified_user_outlined,
                    color: e.inWarranty ? AppColors.teal : AppColors.berry,
                    size: 35,
                  ),
                  const SizedBox(height: 15),
                  Text(
                    e.inWarranty
                        ? 'Đang trong thời hạn bảo hành'
                        : 'Đã hết thời hạn bảo hành',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 10),
                  Text(
                    e.inWarranty
                        ? '15/06/2024 — 31/12/2099'
                        : '15/06/2023 — 30/09/2026',
                    style: const TextStyle(fontSize: 13),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            const SoftCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Điều kiện bảo hành',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  SizedBox(height: 10),
                  Text(
                    'Theo chính sách và hợp đồng bàn giao của nhà cung cấp. Kết luận bảo hành cho từng yêu cầu được xác nhận tại Service Request.',
                    style: TextStyle(fontSize: 13, color: AppColors.muted),
                  ),
                ],
              ),
            ),
          ],
          if (_tab == 3) ...[
            const Text(
              'Mỗi lần bảo trì, một hồ sơ rõ ràng.',
              style: TextStyle(color: AppColors.muted, fontSize: 13),
            ),
            const SizedBox(height: 20),
            const _AssetEvent(
              '27/10/2026',
              'Hoàn thành công việc kỹ thuật',
              'Nguồn Work Order · Kết quả đã được ghi nhận.',
              Icons.task_alt_rounded,
              AppColors.teal,
            ),
            const _AssetEvent(
              '20/10/2026',
              'Kiểm tra tình trạng thiết bị',
              'Bộ phận kỹ thuật · Lưu thông tin đánh giá.',
              Icons.fact_check_outlined,
              AppColors.peach,
            ),
            const _AssetEvent(
              '15/06/2024',
              'Bàn giao và kích hoạt bảo hành',
              'Nguồn Asset · Ghi nhận hồ sơ ban đầu.',
              Icons.inventory_2_outlined,
              AppColors.violet,
            ),
            const SoftCard(
              child: Text(
                'Lịch sử minh họa. Tình trạng vận hành và kết quả Work Order được hiển thị riêng biệt.',
                style: TextStyle(fontSize: 12, color: AppColors.muted),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _AssetEvent extends StatelessWidget {
  const _AssetEvent(this.date, this.title, this.detail, this.icon, this.color);
  final String date, title, detail;
  final IconData icon;
  final Color color;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 24),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CircleAvatar(
          backgroundColor: color.withValues(alpha: .13),
          child: Icon(icon, size: 20, color: color),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(date, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 4),
              Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              Text(detail, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ],
    ),
  );
}

class QrPreviewScreen extends StatelessWidget {
  const QrPreviewScreen({super.key});
  @override
  Widget build(BuildContext context) => UiPage(
    title: 'Quét QR thiết bị',
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const PageHeading(
          'Đưa thiết bị\nvào tầm nhìn.',
          subtitle: 'Quét mã QR để tra cứu đúng hồ sơ thiết bị.',
        ),
        const SizedBox(height: 28),
        Container(
          height: 300,
          decoration: BoxDecoration(
            color: AppColors.ink,
            borderRadius: BorderRadius.circular(32),
          ),
          child: Center(
            child: Container(
              width: 210,
              height: 210,
              decoration: BoxDecoration(
                border: Border.all(color: AppColors.teal, width: 3),
                borderRadius: BorderRadius.circular(26),
              ),
              child: const Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.qr_code_2_rounded,
                    color: Colors.white70,
                    size: 120,
                  ),
                  SizedBox(height: 10),
                  Text(
                    'Mô phỏng khung camera',
                    style: TextStyle(color: Colors.white60, fontSize: 11),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 18),
        const Text(
          'Đặt mã trong khung hình, giữ thiết bị ổn định.',
          textAlign: TextAlign.center,
          style: TextStyle(color: AppColors.muted, fontSize: 12),
        ),
        const SizedBox(height: 24),
        // TODO(mobile-qr): camera permission + scanner; resolve token through the
        // authenticated Asset API. Never open arbitrary scanned URLs.
        FilledButton.icon(
          onPressed: () => openPage(
            context,
            EquipmentDetailScreen(equipment: PreviewData.equipment.first),
          ),
          icon: const Icon(Icons.visibility_outlined, size: 18),
          label: const Text('Xem thiết bị minh họa'),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () => _manualLookup(context),
          icon: const Icon(Icons.keyboard_outlined, size: 18),
          label: const Text('Tra cứu bằng mã'),
        ),
      ],
    ),
  );

  void _manualLookup(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => SafeArea(
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            24,
            0,
            24,
            24 + MediaQuery.viewInsetsOf(sheet).bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Tra cứu bằng mã',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 18),
              const TextField(
                decoration: InputDecoration(
                  hintText: 'Nhập mã hoặc serial thiết bị',
                ),
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: () {
                  Navigator.pop(sheet);
                  previewAction(context, 'Tra cứu thiết bị');
                },
                child: const Text('Tra cứu'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
