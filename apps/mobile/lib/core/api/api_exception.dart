class ApiException implements Exception {
  const ApiException(this.code, {this.status, this.attachmentId});
  final String code;
  final int? status;
  final String? attachmentId;

  String get userMessage => switch (code) {
    'UPLOAD_PAUSED' =>
      'Đã dừng và giữ tệp trên máy. Chọn tiếp tục khi sẵn sàng.',
    'UPLOAD_EXPIRED' =>
      'Lần tải đã hết hạn. Hủy lần tải cũ trước khi chọn lại tệp.',
    'UPLOAD_ABORTED' => 'Lần tải đã được hủy trên máy chủ.',
    'UPLOAD_IN_PROGRESS' =>
      'Máy chủ đang xác minh tệp. Chờ một lát rồi kiểm tra lại cùng lần tải.',
    'UPLOAD_VERIFICATION_FAILED' => 'Tệp không khớp loại, kích thước hoặc mã kiểm tra. Hủy lần tải rồi chọn tệp hợp lệ.',
    'ATTACHMENT_LOCAL_FILE_MISSING' => 'Tệp trên máy bị mất hoặc đã thay đổi. Không gửi lại dữ liệu khác bằng lần tải cũ.',
    'ATTACHMENT_PARENT_CHANGED' => 'Trạng thái hoặc phân công đã đổi. Tệp nháp được giữ, không gửi cho phân công mới.',
    'ATTACHMENT_TOO_LARGE' => 'Chọn tệp từ 1 byte đến 10 MiB.',
    'ATTACHMENT_TYPE_UNSUPPORTED' =>
      'Chỉ hỗ trợ ảnh JPEG, PNG hoặc PDF hợp lệ.',
    'ATTACHMENT_LIMIT_REACHED' =>
      'Đã đủ 10 tệp hoặc lần tải đang giữ chỗ cho mục này.',
    'PICKER_BUSY' =>
      'Lần chọn tệp trước chưa kết thúc. Thử khôi phục trước khi chọn tiếp.',
    'PICKER_DENIED' => 'Không có quyền truy cập ảnh hoặc camera. Kiểm tra quyền ứng dụng rồi thử lại.',
    'PICKER_INTERRUPTED' =>
      'Lần chọn tệp bị gián đoạn. Chọn lại nếu tệp chưa được khôi phục.',
    'WORKSPACE_STORAGE_FAILED' => 'Không đọc hoặc lưu được dữ liệu cục bộ. Kiểm tra kết quả trên máy chủ trước khi gửi tiếp.',
    'CHECKLIST_INCOMPLETE' =>
      'Hoàn tất và lưu các mục checklist bắt buộc trước khi gửi báo cáo.',
    'CHECKLIST_VERSION_CONFLICT' =>
      'Checklist đã thay đổi. Tải lại kết quả để đối soát.',
    'CHECKLIST_REASON_REQUIRED' =>
      'Mục không áp dụng cần được cho phép và có lý do.',
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
