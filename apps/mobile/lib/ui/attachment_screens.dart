import 'package:flutter/material.dart';

import 'components.dart';
import 'preview_data.dart';
import 'theme.dart';

class AttachmentSection extends StatelessWidget {
  const AttachmentSection({super.key, required this.job});
  final JobPreview job;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const Text(
        'Minh chứng rõ ràng, bàn giao trọn vẹn.',
        style: TextStyle(fontSize: 13, color: AppColors.muted),
      ),
      const SizedBox(height: 16),
      Row(
        children: [
          const Expanded(
            child: Text(
              'Tài liệu công việc',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          Pill('M3', color: AppColors.violet),
        ],
      ),
      const SizedBox(height: 14),
      Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [
          for (final label in ['Trước kiểm tra', 'Sau xử lý'])
            SizedBox(
              width: 140,
              child: SoftCard(
                padding: const EdgeInsets.all(12),
                onTap: () => openPage(
                  context,
                  AttachmentViewerScreen(
                    equipment: job.equipment,
                    name: '$label.jpg',
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    EquipmentArt(job.equipment, height: 100),
                    const SizedBox(height: 10),
                    Text(
                      label,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'JPEG · 2.4 MB · Nội bộ',
                      style: TextStyle(fontSize: 9, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
      const SizedBox(height: 14),
      SoftCard(
        padding: const EdgeInsets.all(15),
        onTap: () => openPage(
          context,
          AttachmentViewerScreen(
            equipment: job.equipment,
            name: 'Hướng dẫn kỹ thuật.pdf',
          ),
        ),
        child: const Row(
          children: [
            Icon(Icons.picture_as_pdf_outlined, color: AppColors.berry),
            SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Hướng dẫn kỹ thuật.pdf',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                  ),
                  SizedBox(height: 3),
                  Text(
                    'PDF · 1.2 MB · Nội bộ',
                    style: TextStyle(fontSize: 10, color: AppColors.muted),
                  ),
                ],
              ),
            ),
            Icon(Icons.north_east_rounded, size: 18, color: AppColors.muted),
          ],
        ),
      ),
      const SizedBox(height: 20),
      if (job.stage != JobStage.cancelled && job.stage != JobStage.assigned)
        OutlinedButton.icon(
          onPressed: () => openPage(context, UploadPreviewScreen(job: job)),
          icon: const Icon(Icons.add_rounded),
          label: Text(
            job.stage == JobStage.completed
                ? 'Thêm tài liệu báo cáo'
                : 'Thêm ảnh / tài liệu',
          ),
        ),
      const SizedBox(height: 14),
      const Text(
        'Technician thêm tài liệu nội bộ. Người quản lý quyết định nội dung được công bố cho khách.',
        style: TextStyle(fontSize: 11, color: AppColors.muted),
      ),
    ],
  );
}

class UploadPreviewScreen extends StatelessWidget {
  const UploadPreviewScreen({super.key, required this.job});
  final JobPreview job;
  @override
  Widget build(BuildContext context) => UiPage(
    title: 'Ảnh & tài liệu',
    child: ListView(
      padding: const EdgeInsets.all(22),
      children: [
        PageHeading(
          'Thêm minh chứng',
          eyebrow: job.id,
          subtitle: job.stage == JobStage.completed
              ? 'Tài liệu của báo cáo đã hoàn thành.'
              : 'Tài liệu nội bộ của công việc đang thực hiện.',
        ),
        const SizedBox(height: 24),
        SoftCard(
          child: Column(
            children: [
              const Icon(
                Icons.cloud_upload_outlined,
                size: 46,
                color: AppColors.teal,
              ),
              const SizedBox(height: 14),
              Text(
                'Chọn nội dung từ thiết bị',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              const Text(
                'JPEG, PNG hoặc PDF · Tối đa 10 MB / file',
                style: TextStyle(color: AppColors.muted, fontSize: 11),
              ),
              const SizedBox(height: 22),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => previewAction(context, 'Chụp ảnh'),
                      icon: const Icon(Icons.photo_camera_outlined, size: 18),
                      label: const Text('Camera'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => previewAction(context, 'Chọn file'),
                      icon: const Icon(Icons.folder_open_outlined, size: 18),
                      label: const Text('Chọn file'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SectionTitle('Trạng thái tải lên minh họa'),
        const _UploadItem(
          'kiem-tra-thiet-bi.jpg',
          'Đang tải lên · 62%',
          .62,
          AppColors.teal,
        ),
        const SizedBox(height: 12),
        const _UploadItem(
          'ket-qua-chan-doan.pdf',
          'Chờ xác nhận tệp',
          1,
          AppColors.violet,
        ),
        const SizedBox(height: 12),
        SoftCard(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              const Icon(Icons.error_outline_rounded, color: AppColors.berry),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'anh-hien-truong.jpg',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    Text(
                      'Chưa tải được tệp',
                      style: TextStyle(fontSize: 11, color: AppColors.berry),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: () => previewAction(context, 'Thử tải lại'),
                tooltip: 'Thử tải lại',
                icon: const Icon(Icons.refresh_rounded, color: AppColors.berry),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        const Pill('Nội bộ', icon: Icons.lock_outline_rounded),
        const SizedBox(height: 12),
        const Text(
          'Tiến trình trên chỉ để xem bố cục giao diện. Chưa có file được tải hoặc đính kèm.',
          style: TextStyle(fontSize: 12, color: AppColors.muted),
        ),
        // TODO(mobile-upload): K8 prepare -> signed PUT -> finalize. No Gateway JWT
        // on storage requests. Keep idempotency keys and honor parent/assignment state.
      ],
    ),
  );
}

class _UploadItem extends StatelessWidget {
  const _UploadItem(this.name, this.label, this.progress, this.color);
  final String name, label;
  final double progress;
  final Color color;
  @override
  Widget build(BuildContext context) => SoftCard(
    padding: const EdgeInsets.all(17),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.insert_drive_file_outlined, size: 20, color: color),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                name,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            IconButton(
              onPressed: () => previewAction(context, 'Hủy tệp'),
              tooltip: 'Hủy tệp',
              icon: const Icon(
                Icons.close_rounded,
                size: 17,
                color: AppColors.muted,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: LinearProgressIndicator(
            value: progress,
            minHeight: 5,
            backgroundColor: Colors.white,
            color: color,
          ),
        ),
        const SizedBox(height: 9),
        Text(label, style: TextStyle(fontSize: 11, color: color)),
      ],
    ),
  );
}

class AttachmentViewerScreen extends StatelessWidget {
  const AttachmentViewerScreen({
    super.key,
    required this.equipment,
    required this.name,
  });
  final EquipmentPreview equipment;
  final String name;
  @override
  Widget build(BuildContext context) => UiPage(
    title: 'Xem tài liệu',
    bottom: OutlinedButton.icon(
      onPressed: () => previewAction(context, 'Tải tài liệu'),
      icon: const Icon(Icons.download_outlined, size: 18),
      label: const Text('Tải về'),
    ),
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const Pill('Nội bộ', icon: Icons.lock_outline_rounded),
        const SizedBox(height: 24),
        if (name.endsWith('.pdf'))
          const SizedBox(
            height: 300,
            child: Center(
              child: Icon(
                Icons.picture_as_pdf_outlined,
                size: 100,
                color: AppColors.berry,
              ),
            ),
          )
        else
          EquipmentArt(equipment, height: 300),
        const SizedBox(height: 24),
        Text(name, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 10),
        const Text(
          'Nội dung minh họa. Chưa có tệp thực tế được kết nối.',
          style: TextStyle(color: AppColors.muted, fontSize: 12),
        ),
      ],
    ),
  );
}

class PartsSection extends StatelessWidget {
  const PartsSection({super.key});
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Row(
        children: [
          Expanded(
            child: Text(
              'Phụ tùng của công việc',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          Pill('M3', color: AppColors.violet),
        ],
      ),
      const SizedBox(height: 10),
      const Text(
        'Theo dõi vật tư đã được kho cấp.',
        style: TextStyle(color: AppColors.muted, fontSize: 12),
      ),
      const SizedBox(height: 20),
      for (final (name, code, issued, returned) in [
        ('Bộ lọc khí', 'PT-AF-002', '2', '0'),
        ('Gioăng cao su', 'PT-RS-014', '4', '1'),
      ])
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: SoftCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const CircleAvatar(
                      backgroundColor: AppColors.palePeach,
                      child: Icon(
                        Icons.settings_outlined,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            name,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          Text(
                            code,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(child: _PartNumber('Đã cấp', issued)),
                    Expanded(child: _PartNumber('Đã trả', returned)),
                    Expanded(
                      child: _PartNumber(
                        'Tiêu hao',
                        '${int.parse(issued) - int.parse(returned)}',
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      const SizedBox(height: 8),
      const Text(
        'Số liệu minh họa. Bộ phận kho thực hiện cấp/trả; Technician xem thông tin theo quyền.',
        style: TextStyle(fontSize: 12, color: AppColors.muted),
      ),
      // TODO(mobile-inventory): GET scoped WO parts when Inventory API ships;
      // quantityUsed is issued; consumed = issued - returned. No issue mutation.
    ],
  );
}

class _PartNumber extends StatelessWidget {
  const _PartNumber(this.label, this.value);
  final String label, value;
  @override
  Widget build(BuildContext context) => Column(
    children: [
      Text(
        value,
        style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w600),
      ),
      const SizedBox(height: 4),
      Text(label, style: const TextStyle(fontSize: 10, color: AppColors.muted)),
    ],
  );
}
