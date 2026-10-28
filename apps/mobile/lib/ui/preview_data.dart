import 'package:flutter/material.dart';

import 'theme.dart';

// Presentation fixtures ONLY. TODO(mobile-api): map scoped DTOs from repositories
// to these views. Never use fixture identity/state to authorize an operation.
// IDs here are display codes, not server UUIDs. Add separate resource UUIDs in
// the DTO adapter before any future command or related-resource API integration.
enum JobStage {
  assigned,
  accepted,
  travelling,
  inProgress,
  onHold,
  completed,
  cancelled,
}

extension JobStageView on JobStage {
  String get label => switch (this) {
    JobStage.assigned => 'Chờ tiếp nhận',
    JobStage.accepted => 'Đã tiếp nhận',
    JobStage.travelling => 'Đang di chuyển',
    JobStage.inProgress => 'Đang thực hiện',
    JobStage.onHold => 'Tạm dừng',
    JobStage.completed => 'Đã hoàn thành',
    JobStage.cancelled => 'Đã hủy',
  };
  Color get color => switch (this) {
    JobStage.assigned || JobStage.accepted => AppColors.violet,
    JobStage.travelling ||
    JobStage.inProgress ||
    JobStage.completed => AppColors.teal,
    JobStage.onHold => const Color(0xffb77b34),
    JobStage.cancelled => AppColors.berry,
  };
  bool get isActive => this != JobStage.completed && this != JobStage.cancelled;
}

class EquipmentPreview {
  const EquipmentPreview({
    required this.id,
    required this.name,
    required this.model,
    required this.serial,
    required this.customer,
    required this.site,
    required this.address,
    required this.icon,
    required this.color,
    this.inWarranty = true,
    this.condition = 'Hoạt động bình thường',
  });
  final String id, name, model, serial, customer, site, address, condition;
  final IconData icon;
  final Color color;
  final bool inWarranty;
}

class JobPreview {
  const JobPreview({
    required this.id,
    required this.title,
    required this.equipment,
    required this.stage,
    required this.type,
    required this.color,
    this.priority = 'Bình thường',
    this.dayOffset = 0,
    this.hour,
    this.minute = 0,
    this.durationMinutes = 90,
    this.source = 'Yêu cầu dịch vụ',
    this.result = 'Đã xử lý',
    this.description = 'Thiết bị phát sinh lỗi trong quá trình vận hành. Kiểm tra, xác định nguyên nhân và khôi phục hoạt động theo yêu cầu của khách hàng.',
  });
  final String id, title, type, priority, source, description, result;
  final EquipmentPreview equipment;
  final JobStage stage;
  final Color color;
  final int dayOffset, minute, durationMinutes;
  final int? hour;
  DateTime? get scheduledAt => hour == null
      ? null
      : PreviewData.today.add(
          Duration(days: dayOffset, hours: hour!, minutes: minute),
        );
  String get time =>
      scheduledAt == null ? 'Chưa xếp lịch' : timeLabel(scheduledAt!);
  String get timeRange => scheduledAt == null
      ? 'Chưa xếp lịch'
      : '${timeLabel(scheduledAt!)} – ${timeLabel(scheduledAt!.add(Duration(minutes: durationMinutes)))}';
}

abstract final class PreviewData {
  static final today = DateTime(2026, 10, 28);
  static const equipment = [
    EquipmentPreview(
      id: 'DEMO-ASSET-01',
      name: 'Máy siêu âm',
      model: 'SonoScape P20 Elite',
      serial: 'SS-P20-2024-0186',
      customer: 'Bệnh viện An Bình',
      site: 'Khoa Chẩn đoán hình ảnh',
      address: '146 An Bình, Phường An Đông, TP. Hồ Chí Minh',
      icon: Icons.monitor_heart_outlined,
      color: AppColors.teal,
    ),
    EquipmentPreview(
      id: 'DEMO-ASSET-02',
      name: 'Máy nén khí',
      model: 'Atlas Copco GA 11',
      serial: 'AC-GA11-2023-0428',
      customer: 'Công ty Minh Phát',
      site: 'Nhà xưởng Bình Tân',
      address: 'Lô B12, KCN Tân Tạo, TP. Hồ Chí Minh',
      icon: Icons.precision_manufacturing_outlined,
      color: AppColors.peach,
      inWarranty: false,
      condition: 'Cần kiểm tra',
    ),
    EquipmentPreview(
      id: 'DEMO-ASSET-03',
      name: 'Máy phát điện',
      model: 'Cummins C33 D5',
      serial: 'CM-C33-2024-0075',
      customer: 'Bệnh viện An Bình',
      site: 'Khu kỹ thuật',
      address: '146 An Bình, Phường An Đông, TP. Hồ Chí Minh',
      icon: Icons.electric_bolt_outlined,
      color: AppColors.berry,
      condition: 'Chưa xác nhận',
    ),
    EquipmentPreview(
      id: 'DEMO-ASSET-04',
      name: 'Tủ bảo quản lạnh',
      model: 'Panasonic MPR-414F',
      serial: 'PN-MPR-2025-0032',
      customer: 'Phòng khám Tâm An',
      site: 'Phòng xét nghiệm',
      address: '42 Nguyễn Văn Cừ, TP. Hồ Chí Minh',
      icon: Icons.kitchen_outlined,
      color: AppColors.violet,
    ),
  ];
  static final jobs = [
    JobPreview(
      id: 'WO-2026-1024',
      title: 'Kiểm tra lỗi hiển thị E12',
      equipment: equipment[0],
      stage: JobStage.inProgress,
      type: 'Bảo hành',
      color: AppColors.teal,
      priority: 'Khẩn cấp',
      hour: 8,
      description: 'Màn hình báo lỗi E12 khi khởi động. Khách hàng ghi nhận lỗi từ sáng nay; cần kiểm tra kết nối đầu dò và bộ nguồn.',
    ),
    JobPreview(
      id: 'WO-2026-1025',
      title: 'Khắc phục áp suất không ổn định',
      equipment: equipment[1],
      stage: JobStage.assigned,
      type: 'Sửa chữa',
      color: AppColors.peach,
      priority: 'Cao',
      hour: 10,
    ),
    JobPreview(
      id: 'WO-2026-1026',
      title: 'Bảo trì hệ thống làm mát',
      equipment: equipment[2],
      stage: JobStage.onHold,
      type: 'Bảo trì',
      color: AppColors.berry,
      hour: 13,
      source: 'Bảo trì định kỳ',
    ),
    JobPreview(
      id: 'WO-2026-1027',
      title: 'Kiểm tra nhiệt độ bảo quản',
      equipment: equipment[3],
      stage: JobStage.accepted,
      type: 'Kiểm tra',
      color: AppColors.violet,
      dayOffset: 1,
    ),
    JobPreview(
      id: 'WO-2026-1028',
      title: 'Kiểm tra van an toàn',
      equipment: equipment[1],
      stage: JobStage.travelling,
      type: 'Sửa chữa',
      color: AppColors.teal,
      priority: 'Cao',
      hour: 15,
      minute: 30,
      durationMinutes: 60,
    ),
    JobPreview(
      id: 'WO-2026-1018',
      title: 'Hiệu chỉnh chất lượng hình ảnh',
      equipment: equipment[0],
      stage: JobStage.completed,
      type: 'Bảo hành',
      color: AppColors.teal,
      dayOffset: -1,
      hour: 9,
    ),
    JobPreview(
      id: 'WO-2026-1017',
      title: 'Kiểm tra bộ điều khiển',
      equipment: equipment[2],
      stage: JobStage.completed,
      type: 'Kiểm tra',
      color: AppColors.peach,
      dayOffset: -2,
      hour: 14,
      result: 'Xử lý một phần',
    ),
    JobPreview(
      id: 'WO-2026-1014',
      title: 'Kiểm tra hệ thống cảm biến',
      equipment: equipment[3],
      stage: JobStage.cancelled,
      type: 'Sửa chữa',
      color: AppColors.berry,
      dayOffset: -3,
      hour: 8,
    ),
  ];
}

String timeLabel(DateTime date) =>
    '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
String dateLabel(DateTime date) =>
    '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
String weekdayLabel(int weekday) => weekday == 7 ? 'CN' : 'T${weekday + 1}';
bool sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;
