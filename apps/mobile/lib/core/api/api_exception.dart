class ApiException implements Exception {
  const ApiException(this.code, {this.status});
  final String code;
  final int? status;

  String get userMessage => switch (code) {
    'INVALID_CREDENTIALS' => 'Email, mật khẩu hoặc mã doanh nghiệp chưa đúng.',
    'ACCOUNT_NOT_ACTIVE' => 'Tài khoản chưa được kích hoạt hoặc đã bị khóa.',
    'TENANT_NOT_ACTIVE' => 'Doanh nghiệp hiện không hoạt động.',
    'TECHNICIAN_REQUIRED' => 'Ứng dụng này dành cho tài khoản kỹ thuật viên.',
    'SESSION_EXPIRED' ||
    'INVALID_REFRESH_TOKEN' ||
    'REFRESH_TOKEN_EXPIRED' ||
    'REFRESH_TOKEN_REUSED' => 'Phiên đã hết hiệu lực. Vui lòng đăng nhập lại.',
    'REFRESH_INTERRUPTED' =>
      'Gia hạn phiên bị gián đoạn. Vui lòng đăng nhập lại để tiếp tục.',
    'SESSION_CHANGED' => 'Phiên đăng nhập đã thay đổi. Vui lòng thử lại.',
    'CHECK_BEFORE_RETRY' =>
      'Phiên đã được gia hạn. Kiểm tra trạng thái trước khi gửi lại thao tác.',
    'STORAGE_FAILED' => 'Không thể truy cập bộ nhớ bảo mật. Vui lòng thử lại.',
    'INVALID_RESPONSE' => 'Phản hồi máy chủ không hợp lệ. Vui lòng thử lại.',
    'NETWORK_ERROR' ||
    'TIMEOUT' => 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.',
    _ => switch (status) {
      400 || 422 => 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.',
      401 => 'Phiên đã hết hiệu lực. Vui lòng đăng nhập lại.',
      403 => 'Bạn không có quyền thực hiện thao tác này.',
      404 => 'Không tìm thấy dữ liệu trong phạm vi của bạn.',
      409 => 'Dữ liệu đã thay đổi. Vui lòng tải lại trước khi thao tác.',
      429 => 'Bạn thao tác quá nhanh. Vui lòng chờ rồi thử lại.',
      _ => 'Máy chủ chưa xử lý được yêu cầu. Vui lòng thử lại.',
    },
  };

  // Never include response bodies, credentials, tokens or request URLs.
  @override
  String toString() => 'ApiException(status: $status)';
}
