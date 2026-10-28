import 'package:flutter/material.dart';

import 'components.dart';
import 'theme.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({
    super.key,
    required this.name,
    required this.email,
    this.onLogout,
    this.onCheckSession,
    this.busy = false,
    this.message,
  });
  final String name, email;
  final VoidCallback? onLogout, onCheckSession;
  final bool busy;
  final String? message;

  @override
  Widget build(BuildContext context) => ListView(
    key: const PageStorageKey('profile-scroll'),
    padding: const EdgeInsets.fromLTRB(22, 22, 22, 28),
    children: [
      const PreviewTag(),
      const SizedBox(height: 14),
      const PageHeading(
        'Cá nhân',
        subtitle: 'Một hồ sơ rõ ràng. Một ngày chủ động.',
      ),
      const SizedBox(height: 28),
      Center(
        child: Container(
          width: 86,
          height: 86,
          decoration: const BoxDecoration(
            color: AppColors.palePeach,
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(
              name.trim().isEmpty
                  ? 'K'
                  : name.trim().characters.first.toUpperCase(),
              style: const TextStyle(
                fontSize: 40,
                color: AppColors.berry,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ),
      const SizedBox(height: 18),
      Text(
        name,
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.headlineSmall,
      ),
      const SizedBox(height: 5),
      Text(
        email,
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.bodySmall,
      ),
      const SizedBox(height: 15),
      const Center(child: Pill('Kỹ thuật viên', color: AppColors.violet)),
      const SectionTitle('Hồ sơ làm việc'),
      const SoftCard(
        child: Column(
          children: [
            InfoRow(
              Icons.badge_outlined,
              'Mã nhân viên',
              'TECH-001 · Minh họa',
            ),
            InfoRow(Icons.apartment_outlined, 'Chi nhánh', 'TP. Hồ Chí Minh'),
            InfoRow(
              Icons.circle_outlined,
              'Trạng thái',
              'Đang bận · Do hệ thống cập nhật',
            ),
          ],
        ),
      ),
      const SectionTitle('Kỹ năng'),
      const Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          Pill('Chẩn đoán thiết bị'),
          Pill('Bảo trì cơ điện', color: AppColors.berry),
          Pill('Thiết bị y tế', color: AppColors.violet),
        ],
      ),
      const SizedBox(height: 24),
      SoftCard(
        padding: const EdgeInsets.symmetric(horizontal: 17, vertical: 5),
        child: Column(
          children: [
            _ProfileRow(
              Icons.palette_outlined,
              'Giao diện',
              'Sáng, tối và hiển thị',
              () => openPage(context, const _AppearanceScreen()),
            ),
            _ProfileRow(
              Icons.edit_note_rounded,
              'Nội dung chưa gửi',
              'Bản nháp & file tạm · M3',
              () => openPage(context, const _DraftScreen()),
            ),
            _ProfileRow(
              Icons.help_outline_rounded,
              'Hướng dẫn & hỗ trợ',
              'Đồng hành cùng ca làm việc',
              () => openPage(context, const _HelpScreen()),
            ),
            _ProfileRow(
              Icons.info_outline_rounded,
              'Thông tin ứng dụng',
              'PBL6 Technician · 1.0.0',
              () => showAboutDialog(
                context: context,
                applicationName: 'PBL6 Technician',
                applicationVersion: '1.0.0 · Giao diện xem trước',
                applicationIcon: const Icon(
                  Icons.handyman_outlined,
                  size: 36,
                  color: AppColors.teal,
                ),
                children: const [
                  Text(
                    'Nền tảng dịch vụ kỹ thuật và bảo trì thiết bị. Bản giao diện sử dụng dữ liệu minh họa.',
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      const SectionTitle('Phiên đăng nhập'),
      if (message != null) ...[
        SoftCard(
          color: AppColors.paleTeal,
          child: Text(message!, style: const TextStyle(fontSize: 12)),
        ),
        const SizedBox(height: 12),
      ],
      OutlinedButton.icon(
        onPressed: busy
            ? null
            : onCheckSession ?? () => previewAction(context, 'Kiểm tra phiên'),
        icon: const Icon(Icons.verified_user_outlined, size: 18),
        label: Text(busy ? 'Đang kiểm tra…' : 'Kiểm tra phiên'),
      ),
      const SizedBox(height: 12),
      FilledButton.icon(
        key: const Key('logout'),
        onPressed: busy
            ? null
            : onLogout ?? () => previewAction(context, 'Đăng xuất'),
        icon: const Icon(Icons.logout_rounded, size: 18),
        label: const Text('Đăng xuất'),
      ),
      // TODO(mobile-profile): GET /technicians/me + public branch data; skills and
      // technician availability are read-only. Session callbacks reuse existing P0.
    ],
  );
}

class _ProfileRow extends StatelessWidget {
  const _ProfileRow(this.icon, this.title, this.subtitle, this.onTap);
  final IconData icon;
  final String title, subtitle;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: EdgeInsets.zero,
    minVerticalPadding: 16,
    leading: Icon(icon, color: AppColors.ink, size: 22),
    title: Text(
      title,
      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
    ),
    subtitle: Padding(
      padding: const EdgeInsets.only(top: 3),
      child: Text(
        subtitle,
        style: const TextStyle(fontSize: 11, color: AppColors.muted),
      ),
    ),
    trailing: const Icon(
      Icons.chevron_right_rounded,
      color: AppColors.muted,
      size: 18,
    ),
    onTap: onTap,
  );
}

class _AppearanceScreen extends StatefulWidget {
  const _AppearanceScreen();
  @override
  State<_AppearanceScreen> createState() => _AppearanceScreenState();
}

class _AppearanceScreenState extends State<_AppearanceScreen> {
  int _selected = 0;
  @override
  Widget build(BuildContext context) => UiPage(
    title: 'Giao diện',
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const PageHeading(
          'Không gian\nlàm việc của bạn.',
          subtitle: 'Lựa chọn hiển thị cho những ngày dài.',
        ),
        const SizedBox(height: 28),
        for (var i = 0; i < 3; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: SoftCard(
              color: _selected == i ? AppColors.paleTeal : AppColors.paper,
              onTap: () => setState(() => _selected = i),
              child: Row(
                children: [
                  Icon(
                    [
                      Icons.light_mode_outlined,
                      Icons.dark_mode_outlined,
                      Icons.brightness_auto_outlined,
                    ][i],
                    color: _selected == i ? AppColors.teal : AppColors.muted,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Text(
                      ['Giao diện sáng', 'Giao diện tối', 'Theo thiết bị'][i],
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  Icon(
                    _selected == i
                        ? Icons.radio_button_checked_rounded
                        : Icons.radio_button_off_rounded,
                    size: 21,
                    color: _selected == i ? AppColors.teal : AppColors.muted,
                  ),
                ],
              ),
            ),
          ),
        const SizedBox(height: 12),
        const Text(
          'Lựa chọn đang được xem trước. Theme sáng được sử dụng cho bản giao diện hiện tại.',
          style: TextStyle(color: AppColors.muted, fontSize: 12),
        ),
        const SizedBox(height: 24),
        FilledButton(
          onPressed: () => previewAction(context, 'Lưu tùy chọn giao diện'),
          child: const Text('Lưu tùy chọn'),
        ),
        // TODO(mobile-settings): apply ThemeMode and persist preferences per device.
      ],
    ),
  );
}

class _DraftScreen extends StatelessWidget {
  const _DraftScreen();
  @override
  Widget build(BuildContext context) => UiPage(
    title: 'Nội dung chưa gửi',
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const PageHeading(
          'Tiếp tục khi\nbạn sẵn sàng.',
          subtitle: 'Bản nháp và tệp đang chờ · M3',
        ),
        const SizedBox(height: 24),
        SoftCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Pill('Chưa gửi', color: AppColors.berry),
              const SizedBox(height: 16),
              Text(
                'Báo cáo kiểm tra thiết bị',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              const Text(
                'WO-2026-1024 · Minh họa bản nháp',
                style: TextStyle(fontSize: 12, color: AppColors.muted),
              ),
              const SizedBox(height: 20),
              OutlinedButton(
                onPressed: () => previewAction(context, 'Khôi phục bản nháp'),
                child: const Text('Tiếp tục nhập'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        const Text(
          'Giao diện minh họa trạng thái nội dung chưa gửi. Chưa có bản nháp hoặc file được lưu trên thiết bị.',
          style: TextStyle(color: AppColors.muted, fontSize: 12),
        ),
        // TODO(mobile-drafts): encrypted scope by Gateway/tenant/user/WO, reconcile
        // assignment before restoring. Never queue automatic complete mutations.
      ],
    ),
  );
}

class _HelpScreen extends StatelessWidget {
  const _HelpScreen();
  @override
  Widget build(BuildContext context) => UiPage(
    title: 'Hướng dẫn & hỗ trợ',
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const PageHeading(
          'Luôn có\nngười đồng hành.',
          subtitle: 'Các bước để hoàn thành công việc rõ ràng.',
        ),
        const SizedBox(height: 24),
        for (final (title, detail, icon) in [
          (
            'Tiếp nhận công việc',
            'Mở Công việc, kiểm tra thiết bị và yêu cầu trước khi nhận. Từ chối cần có lý do để điều phối bố trí lại.',
            Icons.work_outline_rounded,
          ),
          (
            'Thực hiện tại hiện trường',
            'Bắt đầu thực hiện, ghi chú tiến độ và nêu lý do khi tạm dừng.',
            Icons.handyman_outlined,
          ),
          (
            'Báo cáo & bàn giao',
            'Ghi rõ vấn đề, giải pháp và kết quả; tách tóm tắt dành cho khách khỏi chẩn đoán nội bộ.',
            Icons.description_outlined,
          ),
          (
            'Khi dữ liệu thay đổi',
            'Tải lại công việc để kiểm tra phân công hiện tại trước khi thao tác.',
            Icons.sync_outlined,
          ),
        ])
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: SoftCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(icon, color: AppColors.teal, size: 27),
                  const SizedBox(height: 15),
                  Text(title, style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  Text(
                    detail,
                    style: const TextStyle(
                      fontSize: 12,
                      height: 1.6,
                      color: AppColors.muted,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    ),
  );
}
