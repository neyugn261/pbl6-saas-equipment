import { useState } from "react";
import type { StudioProps } from "./WorkshopDesignStudio";
import {
  Card,
  Field,
  Choice,
  Notice,
  MachineCard,
  Receipt,
  ReviewAction,
  Form,
} from "./StudioUI";
import { machine, designRoles } from "./design-data";
import EstimateReview, { type EstimateView } from "../workspace/EstimateReview";

export function ServiceJourney({ role }: StudioProps) {
  const [form, set] = useState({
    title: "",
    description: "",
    error: "",
    when: "",
    impact: "STOPPED",
    contact: "",
    phone: "",
    hours: "",
    site: machine.site,
    duplicate: "NO",
    duplicateReason: "",
  });
  const [fileError, setFileError] = useState("");
  const [submittedAt, setSubmittedAt] = useState("");
  const [files, setFiles] = useState<string[]>([]),
    [step, setStep] = useState(0),
    [feedback, setFeedback] = useState("");
  const field = (
    key: keyof typeof form,
    label: string,
    required = false,
    type = "text",
  ) => (
    <Field
      label={label}
      required={required}
      type={type}
      value={form[key]}
      onChange={(value) => set((old) => ({ ...old, [key]: value }))}
    />
  );
  return (
    <div className="studio-two">
      <div>
        <MachineCard />
        <Card title="1. Mô tả sự cố đúng máy">
          <fieldset className="studio-surface" disabled={step >= 2}>
            <Form onSubmit={() => setStep(1)}>
              <p>
                Người gửi: {designRoles[role]}. Bộ phận dịch vụ sẽ đánh giá bảo
                hành và mức ưu tiên.
              </p>
              {field("title", "Tóm tắt vấn đề", true)}
              {field(
                "description",
                "Máy đang có biểu hiện gì?",
                true,
                "textarea",
              )}
              <div className="studio-grid">
                {field("error", "Mã lỗi nếu có")}
                {field(
                  "when",
                  "Bắt đầu xảy ra (giờ Việt Nam)",
                  false,
                  "datetime-local",
                )}
                <Choice
                  label="Ảnh hưởng thực tế"
                  value={form.impact}
                  onChange={(impact) => set({ ...form, impact })}
                  options={[
                    ["STOPPED", "Đã dừng vận hành"],
                    ["DEGRADED", "Vẫn chạy nhưng suy giảm"],
                    ["UNKNOWN", "Chưa xác định, cần kiểm tra"],
                  ]}
                />
                {field("site", "Địa điểm thực tế", true)}
                {field("contact", "Người hỗ trợ tại hiện trường", true)}
                {field("phone", "Điện thoại liên hệ", true, "tel")}
                {field("hours", "Giờ thuận tiện / điều kiện tiếp cận máy")}
              </div>
              <label>
                Ảnh / tài liệu sự cố
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={(event) => {
                    const chosen = Array.from(event.target.files ?? []);
                    const invalid =
                      chosen.length > 5 ||
                      chosen.some(
                        (file) =>
                          file.size > 10 * 1024 * 1024 ||
                          ![
                            "image/jpeg",
                            "image/png",
                            "application/pdf",
                          ].includes(file.type),
                      );
                    setFileError(
                      invalid
                        ? "Chọn tối đa 5 tệp JPG, PNG hoặc PDF; mỗi tệp không quá 10 MB."
                        : "",
                    );
                    setFiles(
                      invalid
                        ? []
                        : chosen.map(
                            (file) =>
                              `${file.name} · ${Math.ceil(file.size / 1024)} KB`,
                          ),
                    );
                  }}
                />
              </label>
              <small>
                Tối đa 5 tệp JPG/PNG/PDF, 10 MB mỗi tệp. Studio không tải tệp
                lên hệ thống.
              </small>
              {fileError && <p role="alert">{fileError}</p>}
              <ul>
                {files.map((file) => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
              <Choice
                label="Kiểm tra yêu cầu tương tự đang mở"
                value={form.duplicate}
                onChange={(duplicate) => set({ ...form, duplicate })}
                options={[
                  ["NO", "Không thấy yêu cầu đang mở"],
                  ["YES", "Có yêu cầu SR-MẪU-2039 đang xử lý"],
                ]}
              />
              {form.duplicate === "YES" && (
                <Notice>
                  <strong>Ưu tiên bổ sung vào hồ sơ đang mở.</strong>
                  <p>
                    SR-MẪU-2039 · máy {machine.serial} · đang chờ kỹ thuật viên.
                  </p>
                  {field(
                    "duplicateReason",
                    "Nếu là sự cố khác, giải thích trước khi tạo mới",
                    true,
                    "textarea",
                  )}
                </Notice>
              )}
              <button className="ws-button" disabled={Boolean(fileError)}>
                Đọc lại thông tin trước khi gửi
              </button>
            </Form>
          </fieldset>
        </Card>
      </div>
      <aside>
        {step === 0 ? (
          <Card title="Sau khi gửi sẽ thế nào?">
            <ol>
              <li>Nhận mã và giờ tiếp nhận.</li>
              <li>Bộ phận dịch vụ xem xét mô tả, bảo hành và bước xử lý.</li>
              <li>
                Theo dõi tiến trình, yêu cầu bổ sung và quyết định của quản trị
                khách hàng tại hồ sơ.
              </li>
            </ol>
            <p>
              Chưa có mốc SLA được chốt trong bản mẫu. Không tự hứa thời gian
              sửa xong.
            </p>
          </Card>
        ) : step === 1 ? (
          <Card title="2. Đọc lại yêu cầu">
            <h3>{form.title}</h3>
            <p>{form.description}</p>
            <p>
              Mã lỗi: {form.error || "Chưa có"} · Bắt đầu:{" "}
              {form.when || "Chưa rõ"}
            </p>
            <p>
              {form.contact} · {form.phone} · {form.hours}
            </p>
            <p>Địa điểm khách báo: {form.site}</p>
            <p>{files.length} tệp được chọn trong phiên thiết kế.</p>
            <button
              type="button"
              className="ws-button"
              disabled={
                Boolean(fileError) ||
                !form.title.trim() ||
                !form.description.trim() ||
                !form.contact.trim() ||
                !form.phone.trim() ||
                !form.site.trim() ||
                (form.duplicate === "YES" && !form.duplicateReason.trim())
              }
              onClick={() => {
                setSubmittedAt(
                  new Date().toLocaleString("vi-VN", {
                    timeZone: "Asia/Ho_Chi_Minh",
                  }),
                );
                setStep(2);
              }}
            >
              Xác nhận gửi trong bản thiết kế
            </button>
          </Card>
        ) : (
          <Receipt title="SR-MẪU-2048 đã được tiếp nhận">
            <p>
              {machine.serial} · Người gửi {form.contact} · {submittedAt}
            </p>
            <p>
              Bên tiếp nhận: Bộ phận dịch vụ An Phú. Bước tiếp: xem xét mô tả và
              phản hồi trên hồ sơ.
            </p>
            <button type="button" onClick={() => setStep(3)}>
              Xem tình huống cần bổ sung
            </button>
            {step === 3 && (
              <>
                <p>
                  Yêu cầu bổ sung: chụp nhãn mã lỗi và cho biết máy có rung khi
                  không tải không.
                </p>
                <Field
                  label="Nội dung bổ sung"
                  value={feedback}
                  onChange={setFeedback}
                  type="textarea"
                />
                <button disabled={!feedback.trim()} onClick={() => setStep(4)}>
                  Gửi bổ sung minh họa
                </button>
              </>
            )}
            {step === 4 && (
              <p>
                Đã thêm phản hồi minh họa; hồ sơ chờ bộ phận dịch vụ đọc lại.
                Không tự coi là sự cố đã được giải quyết.
              </p>
            )}
          </Receipt>
        )}
      </aside>
    </div>
  );
}

export function CaseDesk() {
  const [owner, setOwner] = useState("Minh"),
    [waiting, setWaiting] = useState("CUSTOMER"),
    [next, setNext] = useState("2026-11-10T09:00"),
    [reason, setReason] = useState("");
  const [history, setHistory] = useState<string[]>([
    "08:40 · Tiếp nhận sự cố, Service Manager Minh chịu trách nhiệm.",
  ]);
  const waits: Record<string, string> = {
    CUSTOMER: `Khách cần bổ sung ảnh/mã lỗi; ${owner} theo dõi phản hồi.`,
    APPROVAL: "Customer Admin cần duyệt dự toán phiên bản 2.",
    TECHNICIAN: "Điều phối cần xác nhận người thực hiện và lịch.",
    STOCK: "Kho cần đối soát giao dịch vật tư trước khi tiếp tục.",
    ACCESS: "Khách và điều phối cần thống nhất giờ tiếp cận máy.",
  };
  const publicWaiting: Record<string, string> = {
    CUSTOMER: "Đang chờ bạn bổ sung ảnh hoặc mã lỗi.",
    APPROVAL: "Dự toán bản 2 cần quản trị viên khách hàng xem và phản hồi.",
    TECHNICIAN: "Bộ phận dịch vụ đang thống nhất người thực hiện và lịch.",
    STOCK: "Bộ phận dịch vụ đang kiểm tra vật tư cho công việc.",
    ACCESS: "Cần thống nhất giờ tiếp cận máy với người liên hệ tại địa điểm.",
  };
  return (
    <>
      <MachineCard />
      <div className="studio-two">
        <Card title="Bàn trách nhiệm của SR-MẪU-2048">
          <Form onSubmit={() => {}}>
            <Choice
              label="Chủ hồ sơ dịch vụ"
              value={owner}
              onChange={setOwner}
              options={[
                ["Minh", "Minh — Quản lý dịch vụ"],
                ["Lan", "Lan — Quản lý dịch vụ"],
              ]}
            />
            <Choice
              label="Bước đang chờ"
              value={waiting}
              onChange={setWaiting}
              options={[
                ["CUSTOMER", "Khách bổ sung"],
                ["APPROVAL", "Khách duyệt chi phí"],
                ["TECHNICIAN", "Đội kỹ thuật"],
                ["STOCK", "Kho phụ tùng"],
                ["ACCESS", "Tiếp cận địa điểm"],
              ]}
            />
            <Field
              label="Mốc cần cập nhật tiếp theo (giờ Việt Nam)"
              value={next}
              onChange={setNext}
              required
              type="datetime-local"
            />
            <Field
              label="Lý do thay đổi / việc cần thực hiện"
              value={reason}
              onChange={setReason}
              required
              type="textarea"
            />
            <ReviewAction
              label="Đọc lại thay đổi trách nhiệm"
              onConfirm={() => {
                setHistory((old) => [
                  ...old,
                  `Thay đổi minh họa · ${owner} phụ trách · ${waits[waiting]} · Cập nhật kế tiếp ${next} · ${reason}`,
                ]);
                setReason("");
              }}
            >
              <p>
                Chủ hồ sơ {owner}; mốc tiếp {next}. {waits[waiting]}
              </p>
              <p>{reason}</p>
              <p>
                Đổi chủ hồ sơ không thay người đánh giá bảo hành hoặc kỹ thuật
                viên đã phân công.
              </p>
            </ReviewAction>
          </Form>
        </Card>
        <div>
          <Card title="Xem trước bước tiếp theo và phạm vi công bố">
            <Notice>{waits[waiting]}</Notice>
            <p>
              Chờ từ: 10:00 09/11/2026 (mẫu). Tuổi hồ sơ và thời gian chờ được
              theo dõi riêng.
            </p>
            <h3>Khách được thấy</h3>
            <p>
              {publicWaiting[waiting]} Đầu mối hỗ trợ: bộ phận dịch vụ. Mốc cập
              nhật dự kiến {next.replace("T", " ")} (UTC+7); đây là mốc cập
              nhật, chưa phải giờ sửa xong.
            </p>
            <h3>Nội bộ</h3>
            <p>
              Chủ hồ sơ, trở ngại chi tiết, phối hợp kho và phân công. Có lựa
              chọn công bố từng nội dung cho khách.
            </p>
          </Card>
          <Card title="Lịch sử trách nhiệm">
            <ol>
              {history.map((event, index) => (
                <li key={index}>{event}</li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

const oldEstimate: EstimateView = {
  id: "sample-e1",
  revisionNo: 1,
  status: "SUPERSEDED",
  currency: "VND",
  totalAmount: "1250000",
  validUntil: "2026-11-15",
  notes: "Thay một bộ ổ bi; chưa bao gồm bộ điều khiển.",
  items: [
    {
      itemType: "PART",
      description: "Cụm ổ bi",
      quantity: "1",
      unitPrice: "1000000",
    },
    {
      itemType: "LABOR",
      description: "Công thay và kiểm tra",
      quantity: "1",
      unitPrice: "250000",
    },
  ],
};
const revisedEstimate: EstimateView = {
  ...oldEstimate,
  id: "sample-e2",
  revisionNo: 2,
  status: "SENT",
  totalAmount: "1500000",
  notes:
    "Thay ổ bi và kiểm tra mở rộng tín hiệu; phát sinh bộ điều khiển cần duyệt riêng.",
  items: [
    ...oldEstimate.items,
    {
      itemType: "LABOR",
      description: "Kiểm tra tín hiệu bộ điều khiển",
      quantity: "1",
      unitPrice: "250000",
    },
  ],
};
export function EstimateJourney({ role }: StudioProps) {
  const [decision, setDecision] = useState("APPROVE"),
    [reason, setReason] = useState(""),
    [receipt, setReceipt] = useState("");
  return (
    <>
      <MachineCard />
      <Card title="Dự toán đúng phiên bản">
        <Notice>
          Bản 1 đã được thay thế bởi bản 2. Khoản thêm 250.000 VND là kiểm tra
          tín hiệu; chưa bao gồm thay bộ điều khiển. Dữ liệu và mức giá trong
          màn này là ví dụ.
        </Notice>
        <EstimateReview
          requestNo="SR-MẪU-2048"
          estimate={revisedEstimate}
          previous={oldEstimate}
        />
        {role === "CUSTOMER_ADMIN" ? (
          <Form onSubmit={() => {}}>
            <Choice
              label="Phản hồi"
              value={decision}
              onChange={setDecision}
              options={[
                ["APPROVE", "Đồng ý phạm vi và chi phí bản 2"],
                ["REJECT", "Chưa đồng ý, cần phương án khác"],
              ]}
            />
            <Field
              label={
                decision === "REJECT"
                  ? "Lý do chưa đồng ý"
                  : "Ghi chú cho nhà cung cấp (tùy chọn)"
              }
              required={decision === "REJECT"}
              type="textarea"
              value={reason}
              onChange={setReason}
            />
            <ReviewAction
              label={
                decision === "APPROVE"
                  ? "Đọc lại để chấp thuận bản 2"
                  : "Đọc lại phản hồi từ chối"
              }
              onConfirm={() =>
                setReceipt(
                  decision === "APPROVE"
                    ? "Đã chấp thuận bản 2 — 1.500.000 VND"
                    : "Đã phản hồi chưa đồng ý bản 2",
                )
              }
            >
              <p>
                {decision === "APPROVE"
                  ? "Chỉ chấp thuận phạm vi của bản 2; phát sinh phải được thống nhất riêng."
                  : reason}
              </p>
              <p>
                Người thực hiện: Customer Admin đang được chọn trong studio.
              </p>
            </ReviewAction>
          </Form>
        ) : (
          <Notice>
            {role === "CUSTOMER_USER"
              ? "Bạn được đọc; Customer Admin của doanh nghiệp là người chấp thuận chi phí. Đầu mối mẫu: Nguyễn Hạnh."
              : "Đang chờ Customer Admin phản hồi. Quản lý dịch vụ không tự thay vai trò khách để duyệt chi phí."}
          </Notice>
        )}
      </Card>
      {receipt && (
        <Receipt title={receipt}>
          <p>
            SR-MẪU-2048 · Phiên bản 2 · Hiệu lực đến 15/11/2026 ·{" "}
            {reason || "Không có ghi chú thêm."}
          </p>
        </Receipt>
      )}
    </>
  );
}

export function WorkJourney({ role }: StudioProps) {
  const [step, setStep] = useState(0),
    [serial, setSerial] = useState(""),
    [verified, setVerified] = useState(false),
    [checks, setChecks] = useState<Record<string, boolean>>({});
  const [report, setReport] = useState({
      problem: "",
      cause: "",
      solution: "",
      result: "PARTIAL",
      summary: "",
      remaining: "",
    }),
    [published, setPublished] = useState(false);
  const identityValid = verified && serial.trim() === machine.serial;
  const checklistValid = Object.values(checks).filter(Boolean).length === 3;
  const reportValid = Boolean(
    report.problem.trim() &&
    report.solution.trim() &&
    report.summary.trim() &&
    (report.result === "RESOLVED" || report.remaining.trim()),
  );
  const unlocked = !identityValid
    ? 0
    : !checklistValid
      ? 1
      : !reportValid
        ? 2
        : 3;
  const labels = [
    "Nhận dạng & hiện trường",
    "Checklist & vật tư",
    "Báo cáo nháp",
    "Xem trước & gửi",
  ];
  const field = (key: keyof typeof report, label: string, required = true) => (
    <Field
      type="textarea"
      label={label}
      required={required}
      value={report[key]}
      onChange={(value) => setReport({ ...report, [key]: value })}
    />
  );
  return (
    <>
      <MachineCard />
      <div className="ws-tabs" role="group" aria-label="Bước thực hiện">
        {labels.map((label, index) => (
          <button
            key={label}
            type="button"
            aria-pressed={step === index}
            disabled={index > unlocked}
            onClick={() => setStep(index)}
          >
            {index + 1}. {label}
          </button>
        ))}
      </div>
      {step === 0 ? (
        <Card title="Đúng máy, đúng nơi trước khi làm">
          <p>
            Người liên hệ: {machine.contact}. Giờ tiếp cận 08:00–16:30; báo bảo
            vệ khi đến, máy được khách dừng vận hành trước kiểm tra (mẫu).
          </p>
          <Field
            label="Đối chiếu serial tại hiện trường"
            value={serial}
            onChange={setSerial}
          />
          <p>
            Địa điểm của lệnh: khu A. Máy được báo đã chuyển khu B; cần xác nhận
            lại với điều phối.
          </p>
          <label>
            <input
              type="checkbox"
              checked={verified}
              onChange={(event) => setVerified(event.target.checked)}
            />
            Đã đối chiếu serial và được điều phối xác nhận địa điểm thực hiện
          </label>
          <button
            disabled={!verified || serial.trim() !== machine.serial}
            className="ws-button"
            onClick={() => setStep(1)}
          >
            Tiếp tục công việc mẫu
          </button>
        </Card>
      ) : step === 1 ? (
        <Card title="Ghi nhận thực hiện">
          <p>
            Lịch sử gần nhất: 12/10 kiểm tra lọc và tiếng rung. Lần này kiểm tra
            ổ bi và tín hiệu.
          </p>
          {[
            "Xác nhận máy đã dừng theo hướng dẫn tại hiện trường",
            "Kiểm tra ổ bi và ghi kết quả",
            "Đo/kiểm tra lại sau xử lý",
          ].map((text) => (
            <label className="studio-check" key={text}>
              <input
                type="checkbox"
                checked={Boolean(checks[text])}
                onChange={(event) =>
                  setChecks({ ...checks, [text]: event.target.checked })
                }
              />
              {text}
            </label>
          ))}
          <Notice>
            Vật tư mẫu: xuất 2 bộ ổ bi; dự kiến dùng 1, trả 1. Số thực dùng cần
            được xác nhận sau báo cáo, không khóa nộp báo cáo vì bước đó chưa
            hoàn tất.
          </Notice>
          <label>
            Ảnh trước/sau hoặc bằng chứng
            <input
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              multiple
            />
          </label>
          <button
            className="ws-button"
            disabled={!checklistValid}
            onClick={() => setStep(2)}
          >
            Lập báo cáo nháp
          </button>
        </Card>
      ) : (
        <Card title={step === 2 ? "Báo cáo đang soạn" : "Phần khách sẽ đọc"}>
          <Form onSubmit={() => setStep(3)}>
            {step === 2 ? (
              <>
                {field("problem", "Sự cố ghi nhận")}
                {field("cause", "Nguyên nhân (nếu xác định được)", false)}
                {field("solution", "Các bước đã thực hiện")}
                <Choice
                  label="Kết quả kỹ thuật"
                  value={report.result}
                  onChange={(result) => setReport({ ...report, result })}
                  options={[
                    ["RESOLVED", "Đã xử lý hoàn toàn"],
                    ["PARTIAL", "Xử lý một phần"],
                    ["UNRESOLVED", "Chưa xử lý được"],
                  ]}
                />
                {field("summary", "Tóm tắt khách được đọc")}
                {report.result !== "RESOLVED" &&
                  field("remaining", "Phần còn lại / ai cần hỗ trợ")}
                <p>
                  Nháp đang được giữ trong bộ nhớ của phiên thiết kế; bản web
                  thật có lưu nháp theo tài khoản/lệnh.
                </p>
                <button className="ws-button" disabled={!reportValid}>
                  Xem trước báo cáo
                </button>
              </>
            ) : (
              <>
                <h3>
                  {report.result === "RESOLVED"
                    ? "Đã xử lý hoàn toàn"
                    : report.result === "PARTIAL"
                      ? "Mới xử lý một phần"
                      : "Chưa xử lý được"}
                </h3>
                <p>{report.summary}</p>
                {report.result !== "RESOLVED" && (
                  <Notice>Phần còn lại: {report.remaining}</Notice>
                )}
                <p>
                  Không tự khẳng định tình trạng vận hành của máy hoặc sự đồng ý
                  của khách. Ghi nhận vận hành và xác nhận kết quả là các bước
                  riêng.
                </p>
                <ReviewAction
                  label="Đọc lại và nộp báo cáo mẫu"
                  disabled={
                    role !== "TECHNICIAN" ||
                    !identityValid ||
                    !checklistValid ||
                    !reportValid
                  }
                  onConfirm={() => setPublished(true)}
                >
                  <p>
                    WO-MẪU-2045 · serial {machine.serial} · Công bố phần tóm
                    tắt; giữ nguyên nhân/ghi chú nội bộ theo quyền.
                  </p>
                </ReviewAction>
              </>
            )}
          </Form>
        </Card>
      )}
      {role !== "TECHNICIAN" && (
        <Notice>
          Quản lý dịch vụ được xem hành trình. Kỹ thuật viên được phân công là
          người nộp báo cáo; đổi sang góc nhìn kỹ thuật viên để thử bước gửi
          trong studio.
        </Notice>
      )}
      {published && (
        <Receipt title="Công việc kỹ thuật đã kết thúc">
          <p>
            Kết quả đã gửi trong phiên mẫu. Request chờ đánh giá/khách xác nhận;
            kho còn đối soát vật tư. Không tự đóng mọi hồ sơ liên quan.
          </p>
        </Receipt>
      )}
    </>
  );
}

export function CloseoutJourney({ role }: StudioProps) {
  const [scope, setScope] = useState("MATCHED");
  const [outcome, setOutcome] = useState("PARTIAL"),
    [decision, setDecision] = useState("ACCEPT"),
    [condition, setCondition] = useState("UNKNOWN"),
    [channel, setChannel] = useState("PHONE"),
    [person, setPerson] = useState(""),
    [evidence, setEvidence] = useState(""),
    [receipt, setReceipt] = useState("");
  const staff = role === "SERVICE_MANAGER";
  const outcomes: Record<string, string> = {
    RESOLVED: "Đã xử lý hoàn toàn",
    PARTIAL: "Xử lý một phần",
    UNRESOLVED: "Chưa xử lý được",
  };
  const channels: Record<string, string> = {
    PHONE: "Cuộc gọi",
    EMAIL: "Email",
    SIGNED: "Biên bản",
    PORTAL: "Trao đổi trên portal",
  };
  return (
    <>
      <MachineCard />
      <div className="studio-two">
        <Card title="Kết quả cần được đọc cùng phạm vi">
          <Choice
            label="Đối chiếu phạm vi chi phí"
            value={scope}
            onChange={setScope}
            options={[
              ["MATCHED", "Thực hiện đúng phạm vi bản 2"],
              ["EXTRA_PENDING", "Có phát sinh chưa được duyệt"],
              ["EXTRA_APPROVED", "Phát sinh đã được duyệt bằng bản 3"],
            ]}
          />
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>Hạng mục</th>
                  <th>Khách đã đồng ý</th>
                  <th>Thực tế / phần cần làm rõ</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Cụm ổ bi</td>
                  <td>1 bộ · bản 2</td>
                  <td>Dùng 1 bộ · đã đối soát</td>
                </tr>
                <tr>
                  <td>Công sửa và kiểm tra tín hiệu</td>
                  <td>Bản 2 · tổng phạm vi 1.500.000 VND</td>
                  <td>
                    {outcome === "RESOLVED"
                      ? "Đã thực hiện kiểm tra theo phạm vi báo cáo"
                      : "Đã thực hiện; còn chẩn đoán bộ điều khiển"}
                  </td>
                </tr>
                {scope !== "MATCHED" && (
                  <tr>
                    <td>Bộ điều khiển</td>
                    <td>
                      {scope === "EXTRA_APPROVED"
                        ? "1 bộ · bản 3, 2.000.000 VND bổ sung"
                        : "Chưa được duyệt"}
                    </td>
                    <td>
                      {scope === "EXTRA_APPROVED"
                        ? "Đã thống nhất phạm vi; cần lịch thực hiện riêng"
                        : "Đề nghị thay; chưa thực hiện, cần dự toán mới"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {scope === "EXTRA_PENDING" && (
            <Notice>
              Chưa được tính phần phát sinh như khoản khách đã đồng ý. Có thể
              ghi phản hồi kết quả kỹ thuật, nhưng hồ sơ còn việc duyệt phạm vi;
              không tự đóng toàn bộ ca.
            </Notice>
          )}
          <Choice
            label="Tình huống kết quả"
            value={outcome}
            onChange={setOutcome}
            options={[
              ["RESOLVED", "Đã xử lý hoàn toàn"],
              ["PARTIAL", "Xử lý một phần"],
              ["UNRESOLVED", "Chưa xử lý được"],
            ]}
          />
          <dl className="sd-facts">
            <div>
              <dt>Đã làm</dt>
              <dd>Thay 1 bộ ổ bi; thử lại tiếng rung.</dd>
            </div>
            <div>
              <dt>Phạm vi đã duyệt</dt>
              <dd>
                Dự toán bản 2: 1.500.000 VND.{" "}
                {scope === "EXTRA_APPROVED"
                  ? "Bản 3 đã duyệt bổ sung thay bộ điều khiển: 2.000.000 VND; chưa đồng nghĩa đã thực hiện."
                  : "Chưa duyệt thay bộ điều khiển."}
              </dd>
            </div>
            <div>
              <dt>Vật tư</dt>
              <dd>
                Xuất 2; xác nhận dùng 1; trả 1. Thay linh kiện không tự gia hạn
                bảo hành.
              </dd>
            </div>
            <div>
              <dt>Phần còn lại</dt>
              <dd>
                {outcome === "RESOLVED"
                  ? scope === "MATCHED"
                    ? "Không có phần còn lại được báo cáo; vẫn cần khách đọc kết quả."
                    : "Phạm vi sửa trong báo cáo đã giải quyết; đề nghị thêm về bộ điều khiển được theo dõi riêng, không tự khép công việc phát sinh."
                  : "Kiểm tra bộ điều khiển. Minh chịu trách nhiệm thống nhất lịch và chi phí nếu phát sinh."}
              </dd>
            </div>
          </dl>
          <Choice
            label="Tình trạng máy được ghi nhận riêng"
            value={condition}
            onChange={setCondition}
            options={[
              ["UNKNOWN", "Chưa có xác nhận vận hành"],
              ["OPERATIONAL", "Đã xác nhận hoạt động"],
              ["DEGRADED", "Đã xác nhận suy giảm"],
              ["STOPPED", "Đã xác nhận không hoạt động"],
            ]}
          />
          {condition === "UNKNOWN" ? (
            <p>
              Chưa có người hoặc thời điểm ghi nhận vận hành. Không suy ra máy
              tốt từ việc lệnh đã hoàn tất.
            </p>
          ) : (
            <dl className="sd-facts">
              <div>
                <dt>Người ghi nhận vận hành</dt>
                <dd>Hoàng An · kỹ thuật viên (mẫu)</dd>
              </div>
              <div>
                <dt>Thời điểm ghi nhận</dt>
                <dd>09/11/2026 15:45 · UTC+7 (mẫu)</dd>
              </div>
              <div>
                <dt>Căn cứ</dt>
                <dd>
                  Thử máy tại hiện trường cùng người liên hệ; đây là quan sát
                  tại thời điểm ghi nhận.
                </dd>
              </div>
            </dl>
          )}
        </Card>
        <Card
          title={
            staff ? "Nhân viên xác nhận thay khách" : "Phản hồi kết quả dịch vụ"
          }
        >
          <Form onSubmit={() => {}}>
            <Choice
              label="Quyết định"
              value={decision}
              onChange={setDecision}
              options={[
                ["ACCEPT", "Đã đọc và đồng ý phạm vi được ghi nhận"],
                ["DISAGREE", "Chưa đồng ý / đề nghị xem lại"],
                ["RECURRING", "Sự cố đã tái diễn"],
                ["WAITING", "Chưa có phản hồi của khách"],
              ]}
            />
            {staff && (
              <>
                <Field
                  label={
                    decision === "ACCEPT"
                      ? "Người phía khách đã đồng ý"
                      : "Người phía khách phản hồi"
                  }
                  required
                  value={person}
                  onChange={setPerson}
                />
                <Choice
                  label="Kênh xác nhận"
                  value={channel}
                  onChange={setChannel}
                  options={[
                    ["PHONE", "Cuộc gọi"],
                    ["EMAIL", "Email"],
                    ["SIGNED", "Biên bản"],
                    ["PORTAL", "Trao đổi trên portal"],
                  ]}
                />
              </>
            )}
            <Field
              label={
                staff
                  ? "Căn cứ / nội dung phản hồi đã nhận"
                  : "Ý kiến và phần cần làm rõ"
              }
              value={evidence}
              onChange={setEvidence}
              required={staff || decision !== "ACCEPT"}
              type="textarea"
            />
            {outcome !== "RESOLVED" && (
              <label className="studio-check">
                <input type="checkbox" required />
                Tôi hiểu kết quả chưa xử lý hoàn toàn và đã đọc phần việc còn
                lại; xác nhận không xóa phần việc đó.
              </label>
            )}
            {decision === "WAITING" ? (
              <Notice>
                Giữ trạng thái chờ phản hồi, có đầu mối và mốc nhắc lại. Không
                tự tạo bằng chứng khách đã đồng ý.
              </Notice>
            ) : (
              <ReviewAction
                label={
                  staff
                    ? "Đọc lại căn cứ xác nhận thay"
                    : "Đọc lại phản hồi kết quả"
                }
                disabled={
                  (staff && !person.trim()) ||
                  ((staff || decision !== "ACCEPT") && !evidence.trim())
                }
                onConfirm={() =>
                  setReceipt(
                    decision === "ACCEPT"
                      ? scope === "EXTRA_PENDING"
                        ? "Đã ghi phản hồi kỹ thuật; còn chờ duyệt phát sinh"
                        : "Đã ghi nhận xác nhận phạm vi"
                      : "Đã ghi nhận đề nghị tiếp tục xem xét",
                  )
                }
              >
                <p>
                  SR-MẪU-2048 · {outcomes[outcome]} ·{" "}
                  {staff
                    ? `${person}, kênh ${channels[channel]}; thao tác dưới tài khoản nhân viên`
                    : "Tài khoản khách tự phản hồi"}
                  .
                </p>
                <p>{evidence}</p>
                <p>
                  Phát sinh chưa được duyệt và phần việc còn lại vẫn được theo
                  dõi riêng.
                </p>
              </ReviewAction>
            )}
          </Form>
        </Card>
      </div>
      {receipt && (
        <Receipt title={receipt}>
          <p>
            Người thực hiện và căn cứ được ghi riêng. Nếu sự cố tái diễn: mở hồ
            sơ liên kết với lần xử lý trước, giữ lịch sử và thông tin máy.
          </p>
        </Receipt>
      )}
    </>
  );
}

export function HandoverJourney({ role }: StudioProps) {
  const [decision, setDecision] = useState("ACCEPT"),
    [reason, setReason] = useState(""),
    [receipt, setReceipt] = useState("");
  return (
    <>
      <MachineCard />
      <Card title="Biên bản BG-MẪU-0042 · bản gửi khách v2">
        <div className="studio-grid">
          <section>
            <h3>Nội dung cố định của bản gửi</h3>
            <p>
              Máy mới; đã kiểm tra serial, dây nguồn và tài liệu hướng dẫn. Giao
              ngày 19/03/2026 tại nhà xưởng Bình An.
            </p>
            <h3>Bảo hành của đúng bản này</h3>
            <p>
              19/03/2026–18/03/2027. Bảo hành lỗi thuộc phạm vi chính sách; loại
              trừ hỏng do dùng sai hướng dẫn và tác động bên ngoài theo điều
              khoản đã gửi.
            </p>
            <p>Xác nhận bàn giao không tự dời ngày bảo hành.</p>
            <h3>Tài liệu đi kèm</h3>
            <ul>
              <li>Hướng dẫn WP-200 · v1</li>
              <li>Phiếu kiểm tra trước bàn giao</li>
              <li>Ảnh serial và phụ kiện bàn giao</li>
            </ul>
          </section>
          <section>
            <h3>Thay đổi so với bản v1</h3>
            <p>
              Bổ sung khu vực máy A và người liên hệ Nguyễn Hạnh. Serial và thời
              hạn bảo hành không thay đổi.
            </p>
            <Notice>
              Chính sách hiện tại nếu thay đổi được hiển thị làm tham chiếu
              riêng. Không ghi đè bản v2 đang được khách xác nhận.
            </Notice>
            <p>
              Bảo trì kế tiếp dự kiến 19/06/2026; lịch kỹ thuật thực hiện cần
              thống nhất riêng.
            </p>
          </section>
        </div>
        {role === "CUSTOMER_ADMIN" ? (
          <Form onSubmit={() => {}}>
            <Choice
              label="Phản hồi biên bản"
              value={decision}
              onChange={setDecision}
              options={[
                ["ACCEPT", "Đồng ý nội dung bản v2"],
                ["REJECT", "Cần chỉnh nội dung trước khi xác nhận"],
              ]}
            />
            <Field
              label="Nội dung cần chỉnh / ghi chú"
              value={reason}
              required={decision === "REJECT"}
              onChange={setReason}
              type="textarea"
            />
            <label className="studio-check">
              <input required type="checkbox" />
              Đã đối chiếu máy, serial, tình trạng và điều khoản của bản v2
            </label>
            <ReviewAction
              label="Đọc lại trước khi phản hồi bàn giao"
              onConfirm={() =>
                setReceipt(
                  decision === "ACCEPT"
                    ? "Đã chấp thuận biên bản bản v2"
                    : "Đã yêu cầu sửa biên bản",
                )
              }
            >
              <p>
                {machine.serial} · BG-MẪU-0042 v2 ·{" "}
                {reason || "Không có ghi chú bổ sung."}
              </p>
            </ReviewAction>
          </Form>
        ) : role === "SERVICE_MANAGER" ? (
          <ReviewAction
            label="Đọc lại trước khi gửi bản v2"
            onConfirm={() => setReceipt("Đã gửi bản v2 trong phiên mẫu")}
          >
            <p>
              Customer Admin sẽ đọc bản cố định này. Gửi lại phiên bản mới phải
              giải thích thay đổi và không giữ chấp thuận của bản cũ cho nội
              dung mới.
            </p>
          </ReviewAction>
        ) : (
          <Notice>
            Customer Admin là người phản hồi chấp thuận. Bạn có thể đối chiếu và
            gửi thông tin sai lệch cho đầu mối của doanh nghiệp.
          </Notice>
        )}
      </Card>
      {receipt && (
        <Receipt title={receipt}>
          <p>
            {reason} · Lưu bản v2, người phản hồi và thời điểm. Khách luôn đọc
            lại được nội dung mình đã đồng ý.
          </p>
        </Receipt>
      )}
    </>
  );
}
