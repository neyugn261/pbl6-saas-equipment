import { useState } from "react";
import {
  journeys,
  designRoles,
  type DesignRole,
  type JourneyId,
} from "./design-data";
import {
  ServiceJourney,
  CaseDesk,
  EstimateJourney,
  WorkJourney,
  CloseoutJourney,
  HandoverJourney,
} from "./StudioJourneys";
import {
  DispatchJourney,
  StockJourney,
  MaintenanceJourney,
  ManagementJourney,
  AccountsJourney,
  DocumentsJourney,
} from "./StudioOperations";
import "../workspace/workspace.css";
import "../workspace/workshop.css";
import "./studio.css";

const views = {
  request: ServiceJourney,
  case: CaseDesk,
  estimate: EstimateJourney,
  dispatch: DispatchJourney,
  work: WorkJourney,
  stock: StockJourney,
  closeout: CloseoutJourney,
  maintenance: MaintenanceJourney,
  handover: HandoverJourney,
  management: ManagementJourney,
  accounts: AccountsJourney,
  documents: DocumentsJourney,
};
export type StudioProps = { role: DesignRole };
export default function WorkshopDesignStudio() {
  const [role, setRole] = useState<DesignRole>("CUSTOMER_USER");
  const [selected, select] = useState<JourneyId>("request");
  const [scenario, setScenario] = useState("ready");
  const available = journeys.filter((item) =>
    (item.roles as readonly string[]).includes(role),
  );
  const active = available.find((item) => item.id === selected) ?? available[0];
  const View = views[active.id];
  const [recovery, setRecovery] = useState("");
  return (
    <div className="workshop-shell studio-shell">
      <aside className="studio-ribbon">
        <strong>STUDIO THIẾT KẾ UI</strong>
        <span>
          Dữ liệu minh họa · Không kết nối API · Không thay đổi dữ liệu hay
          quyền thật
        </span>
        <a href="/login">Về web đăng nhập</a>
      </aside>
      <header className="workshop-top">
        <a className="workshop-brand" href="/design/workshop">
          <strong>servio</strong>
          <small>/ workshop</small>
        </a>
        <div className="workshop-context">
          <strong>{designRoles[role]}</strong>
          <small>Review chức năng và các tình huống sử dụng</small>
        </div>
        <label>
          Góc nhìn người dùng
          <select
            aria-label="Góc nhìn người dùng"
            value={role}
            onChange={(event) => {
              const next = event.target.value as DesignRole;
              setRole(next);
              select(
                journeys.find((item) =>
                  (item.roles as readonly string[]).includes(next),
                )!.id,
              );
              setScenario("ready");
            }}
          >
            {Object.entries(designRoles).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </header>
      <nav className="workshop-navigation" aria-label="Hành trình thiết kế">
        {available.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={active.id === item.id}
            onClick={() => {
              select(item.id);
              setScenario("ready");
              setRecovery("");
            }}
          >
            {item.name}
          </button>
        ))}
      </nav>
      <main className="sm-workspace workshop-main">
        <div className="studio-review-controls">
          <label>
            Tình huống giao diện
            <select
              aria-label="Tình huống giao diện"
              value={scenario}
              onChange={(event) => {
                setScenario(event.target.value);
                setRecovery("");
              }}
            >
              {[
                ["ready", "Có dữ liệu"],
                ["loading", "Đang tải"],
                ["empty", "Không có theo bộ lọc"],
                ["error", "Nguồn chưa phản hồi"],
                ["restricted", "Không được xem"],
                ["readonly", "Chỉ đọc / đã kết thúc"],
                ["uncertain", "Chưa rõ kết quả gửi"],
                ["conflict", "Hồ sơ đã có thay đổi"],
              ].map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <p>
            Chọn trạng thái để kiểm tra cách giải thích và phục hồi. Nội dung
            form được giữ khi đổi trạng thái trong cùng hành trình.
          </p>
        </div>
        <header className="ws-heading">
          <div>
            <span className="ws-eyebrow">
              THIẾT KẾ TRƯỚC / API TRIỂN KHAI SAU
            </span>
            <h1>{active.name}</h1>
            <p>
              Mục tiêu: biết đúng hồ sơ, bên cần hành động, tác động của quyết
              định và bước tiếp theo.
            </p>
          </div>
        </header>
        {scenario === "loading" ? (
          <div
            role="status"
            className="ws-skeleton"
            aria-label="Đang tải hồ sơ"
          >
            <span />
            <span />
            <span />
          </div>
        ) : scenario === "empty" ? (
          <section className="ws-card studio-card-body">
            <h2>Chưa có hồ sơ theo bộ lọc này</h2>
            <p>
              Không đồng nghĩa doanh nghiệp chưa từng có dữ liệu. Đổi nhóm hoặc
              bỏ bộ lọc để tiếp tục.
            </p>
            <button onClick={() => setScenario("ready")}>
              Bỏ lọc và xem mẫu
            </button>
          </section>
        ) : scenario === "error" || scenario === "restricted" ? (
          <section className="ws-error" role="alert">
            <h2>
              {scenario === "error"
                ? "Chưa tải được hồ sơ"
                : "Tài khoản chưa có quyền xem nội dung này"}
            </h2>
            <p>
              {scenario === "error"
                ? "Giữ nội dung đang nhập; đọc lại dữ liệu trước khi gửi thêm."
                : "Nhờ quản trị viên kiểm tra phạm vi tài khoản. Không dùng dữ liệu của người khác thay thế."}
            </p>
            <button onClick={() => setScenario("ready")}>
              Quay lại dữ liệu mẫu
            </button>
          </section>
        ) : null}
        {["readonly", "uncertain", "conflict"].includes(scenario) && (
          <section className="workshop-next" role="alert">
            <h2>
              {scenario === "uncertain"
                ? "Chưa xác định thao tác đã được ghi nhận"
                : scenario === "conflict"
                  ? "Hồ sơ nguồn đã thay đổi"
                  : "Hồ sơ đang ở chế độ chỉ đọc"}
            </h2>
            <p>
              {scenario === "uncertain"
                ? "Khóa gửi lại; kiểm tra kết quả của lần gửi trước để tránh tạo trùng."
                : scenario === "conflict"
                  ? "Nội dung đang nhập được giữ. Đọc lại thay đổi trước khi quyết định; không tự ghi đè."
                  : "Có thể đọc và đối chiếu, chưa được phép ghi thêm."}
            </p>
            {scenario !== "readonly" && (
              <button
                onClick={() =>
                  setRecovery(
                    "Đã mở bản đối chiếu minh họa. Không tự gửi lại hoặc ghi đè; cần kết quả xác thực từ hệ thống khi kết nối API.",
                  )
                }
              >
                Đọc lại để đối soát
              </button>
            )}
            {recovery && <p role="status">{recovery}</p>}
            <button onClick={() => setScenario("ready")}>
              Quay về tình huống có dữ liệu mẫu
            </button>
          </section>
        )}
        <div
          hidden={["loading", "empty", "error", "restricted"].includes(
            scenario,
          )}
        >
          <fieldset className="studio-surface" disabled={scenario !== "ready"}>
            <View key={`${role}:${active.id}`} role={role} />
          </fieldset>
        </div>
        <footer className="workshop-footer">
          <span>12 hành trình · 8 vai trò · Web</span>
          <span>Thao tác trong studio chỉ phục vụ review thiết kế</span>
        </footer>
      </main>
    </div>
  );
}
