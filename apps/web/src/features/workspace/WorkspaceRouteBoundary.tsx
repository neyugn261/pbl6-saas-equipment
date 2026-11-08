import { Component, type ReactNode } from "react";

/** A route bundle can fail independently of the data API (offline/new deployment). */
export default class WorkspaceRouteBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <section className="ws-error" role="alert">
        <h1>Chưa mở được màn hình này</h1>
        <p>
          Kết nối có thể bị gián đoạn hoặc web vừa được cập nhật. Tải lại trang
          để lấy phiên bản hiện tại. Nháp đã lưu trong tab được giữ theo tài
          khoản; nội dung chưa lưu có thể cần nhập lại.
        </p>
        <button
          type="button"
          className="ws-button"
          onClick={() => window.location.reload()}
        >
          Tải lại trang
        </button>
      </section>
    ) : (
      this.props.children
    );
  }
}
