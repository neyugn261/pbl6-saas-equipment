import 'package:flutter/material.dart';

import '../workspace/read_widgets.dart';
import 'app_preferences.dart';

class PreferencesScreen extends StatelessWidget {
  const PreferencesScreen({super.key, required this.preferences});
  final AppPreferences preferences;
  @override
  Widget build(BuildContext context) => ReadPage(
    title: 'Giao diện',
    child: AnimatedBuilder(
      animation: preferences,
      builder: (context, _) => ReadList(
        children: [
          const Text(
            'Chọn giao diện trên thiết bị này. Tùy chọn được giữ khi mở lại ứng dụng và áp dụng cho màn hình đăng nhập.',
          ),
          for (final mode in ThemeMode.values)
            ListTile(
              key: Key('theme-${mode.name}'),
              selected: preferences.themeMode == mode,
              leading: Icon(switch (mode) {
                ThemeMode.system => Icons.brightness_auto,
                ThemeMode.light => Icons.light_mode_outlined,
                ThemeMode.dark => Icons.dark_mode_outlined,
              }),
              title: Text(switch (mode) {
                ThemeMode.system => 'Theo hệ thống',
                ThemeMode.light => 'Sáng',
                ThemeMode.dark => 'Tối',
              }),
              trailing: preferences.themeMode == mode
                  ? const Icon(Icons.check_circle)
                  : null,
              enabled: !preferences.busy,
              onTap: () => preferences.setTheme(mode),
            ),
          if (preferences.busy) const LinearProgressIndicator(),
          if (preferences.error != null)
            Notice(
              preferences.error!,
              action: TextButton(
                onPressed: preferences.busy ? null : preferences.load,
                child: const Text('Thử đọc lại'),
              ),
            ),
          const Text(
            'Cỡ chữ theo cài đặt trợ năng của thiết bị. Bạn có thể tăng cỡ chữ trong cài đặt Android.',
          ),
        ],
      ),
    ),
  );
}

class MobileHelpScreen extends StatelessWidget {
  const MobileHelpScreen({super.key});
  @override
  Widget build(BuildContext context) => const ReadPage(
    title: 'Hướng dẫn sử dụng',
    child: ReadList(
      children: [
        DataCard(
          'Nhận và thực hiện công việc',
          fields: {
            'Bắt đầu': 'Mở Công việc hoặc Lịch, xem thiết bị và liên hệ, rồi nhận việc. Cập nhật di chuyển, bắt đầu, tạm dừng hoặc tiếp tục theo trạng thái được phép.',
            'Phân công thay đổi': 'Tải lại để xem phân công mới. Công việc từng được giao vẫn có thể tra cứu trong Lịch sử theo quyền.',
          },
        ),
        DataCard(
          'Lịch dự kiến',
          fields: {
            'Ngày / Tuần / Tháng': 'Chọn ngày để xem các công việc bắt đầu trong ngày. Có thể xem cả tuần/tháng và bật lịch sử cá nhân.',
            'Chưa xếp lịch': 'Luôn có nhóm công việc hiện tại chưa có giờ bắt đầu. Lịch dùng giờ Việt Nam và chưa phải lịch hẹn khách hàng xác nhận.',
          },
        ),
        DataCard(
          'Checklist và báo cáo',
          fields: {
            'Bảo trì':
                'Hoàn tất và lưu checklist bắt buộc trước khi gửi báo cáo.',
            'Báo cáo': 'Nhập chẩn đoán, xử lý, kết quả và nội dung gửi khách; kiểm tra trước khi hoàn thành. Báo cáo đã nộp chỉ được xem lại.',
          },
        ),
        DataCard(
          'Ảnh và tài liệu',
          fields: {
            'Tải lên': 'Chụp ảnh hoặc chọn JPEG/PNG/PDF tối đa 10 MiB, xem lại nháp rồi chủ động gửi. Tệp công việc xử lý trước khi hoàn thành; tệp báo cáo đính kèm sau khi có báo cáo.',
            'Gián đoạn': 'Mở lại đúng công việc để tiếp tục hoặc kiểm tra kết quả. Dừng giữ nháp; hủy cần xác nhận. Nếu lần tải hết hạn, xử lý lần cũ trước khi chọn lại.',
          },
        ),
        DataCard(
          'Khi mất mạng và đăng xuất',
          fields: {
            'Nháp': 'Nháp báo cáo, checklist và tệp được giữ trên thiết bị cho đúng tài khoản. Không tự gửi lại khi có mạng.',
            'Kết quả chưa rõ': 'Chọn kiểm tra kết quả trước khi thao tác tiếp, nhất là khi gửi báo cáo hoặc tệp bị gián đoạn.',
            'Dữ liệu thiết bị': 'Đăng xuất giữ nháp cho lần đăng nhập lại. Gỡ ứng dụng hoặc xóa dữ liệu ứng dụng sẽ mất nháp.',
          },
        ),
        DataCard(
          'Thông báo, phụ tùng và hồ sơ',
          fields: {
            'Thông báo': 'Chuông hiển thị thông báo trong ứng dụng; không cam kết thông báo hệ thống khi app đóng.',
            'Phụ tùng': 'Xem số đã cấp, đã trả và đã xác nhận dùng. Số chưa trả không đồng nghĩa đã sử dụng; liên hệ kho khi cần xử lý.',
            'Hồ sơ': 'Trạng thái, chi nhánh và kỹ năng do quản lý cập nhật. Ứng dụng không có quyền tự đổi các thông tin này.',
          },
        ),
      ],
    ),
  );
}

class AppInformationScreen extends StatelessWidget {
  const AppInformationScreen({super.key, this.load = ApplicationInfo.load});
  final Future<ApplicationInfo> Function() load;
  @override
  Widget build(BuildContext context) => ReadPage(
    title: 'Thông tin ứng dụng',
    child: ReadList(
      children: [
        const DataCard(
          'PBL6 Technician',
          fields: {
            'Mục đích': 'Thực hiện dịch vụ sửa chữa, bảo hành và bảo trì thiết bị theo phân công.',
            'Dữ liệu': 'Sử dụng quyền truy cập của tài khoản đang đăng nhập.',
          },
        ),
        ReadView<ApplicationInfo>(
          load: load,
          builder: (info) => DataCard(
            'Phiên bản đã cài',
            fields: {'Phiên bản': info.version, 'Bản dựng': info.build},
          ),
        ),
      ],
    ),
  );
}
