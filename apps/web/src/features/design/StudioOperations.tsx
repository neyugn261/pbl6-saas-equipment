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
import {
  machine,
  maintenanceDates,
  overlaps,
  decimalHundred,
  decimalText,
} from "./design-data";
import { quantityText } from "../workspace/ui-values";
import HistoryJourney from "./HistoryJourney";

const assignments = [
  {
    code: "WO-MẪU-2041",
    tech: "An",
    day: "2026-11-09",
    start: "09:00",
    end: "11:00",
    site: "Nhà xưởng Bình An",
  },
  {
    code: "WO-MẪU-2043",
    tech: "An",
    day: "2026-11-10",
    start: "13:00",
    end: "16:00",
    site: "Xưởng Đông",
  },
  {
    code: "WO-MẪU-2046",
    tech: "Bình",
    day: "2026-11-09",
    start: "08:00",
    end: "10:00",
    site: "Kho máy Tây",
  },
];
export function DispatchJourney() {
  const [tech, setTech] = useState("An"),
    [day, setDay] = useState("2026-11-09"),
    [start, setStart] = useState("09:30"),
    [end, setEnd] = useState("11:30"),
    [customer, setCustomer] = useState("PROPOSED"),
    [reason, setReason] = useState(""),
    [receipt, setReceipt] = useState(false),
    [range, setRange] = useState("WEEK");
  const startValue = `${day}T${start}`,
    endValue = `${day}T${end}`;
  const conflicts = assignments.filter(
    (row) =>
      row.tech === tech &&
      overlaps(
        startValue,
        endValue,
        `${row.day}T${row.start}`,
        `${row.day}T${row.end}`,
      ),
  );
  const valid = Boolean(day && start && end && endValue > startValue);
  return (
    <>
      <MachineCard />
      <div className="studio-two">
        <Card title="Lịch dự kiến của đội kỹ thuật">
          <Choice
            label="Cách xem"
            value={range}
            onChange={setRange}
            options={[
              ["WEEK", "Theo tuần 09–15/11/2026"],
              ["DAY", "Theo ngày đang chọn"],
            ]}
          />
          <div className="studio-calendar">
            {Array.from({ length: range === "WEEK" ? 7 : 1 }, (_, index) =>
              range === "WEEK"
                ? `2026-11-${String(9 + index).padStart(2, "0")}`
                : day,
            ).map((date) => (
              <section key={date}>
                <h3>{date.split("-").reverse().join("/")}</h3>
                {assignments
                  .filter((row) => row.day === date)
                  .map((row) => (
                    <button
                      key={row.code}
                      onClick={() => {
                        setTech(row.tech);
                        setDay(row.day);
                      }}
                    >
                      <strong>
                        {row.start}–{row.end} · {row.tech}
                      </strong>
                      <span>{row.code}</span>
                      <small>{row.site}</small>
                    </button>
                  ))}
                {!assignments.some((row) => row.day === date) && (
                  <p>
                    Không có lệnh trong mẫu này; chưa chứng minh trống lịch làm
                    việc.
                  </p>
                )}
              </section>
            ))}
          </div>
          <h3>Chưa có lịch</h3>
          <p>
            WO-MẪU-2051 · máy {machine.serial} · cần người có kỹ năng bơm công
            nghiệp. Đây là hồ sơ đang lập lịch ở bên cạnh.
          </p>
          <p>
            Giờ làm việc tham chiếu: 08:00–17:00, UTC+7. Lịch chỉ tính các lệnh
            trong mẫu, chưa tính nghỉ phép/di chuyển.
          </p>
        </Card>
        <Card title="Phân công và xác nhận lịch">
          <Form onSubmit={() => {}}>
            <div className="studio-grid">
              <Choice
                label="Kỹ thuật viên"
                value={tech}
                onChange={setTech}
                options={[
                  ["An", "Hoàng An · bơm công nghiệp · CN miền Trung"],
                  ["Bình", "Lê Bình · bơm công nghiệp, điện · CN miền Trung"],
                ]}
              />
              <Field
                label="Ngày dự kiến"
                type="date"
                required
                value={day}
                onChange={setDay}
              />
              <Field
                label="Bắt đầu (UTC+7)"
                type="time"
                required
                value={start}
                onChange={setStart}
              />
              <Field
                label="Kết thúc (UTC+7)"
                type="time"
                required
                value={end}
                onChange={setEnd}
              />
            </div>
            <Choice
              label="Khách đã xác nhận lịch chưa?"
              value={customer}
              onChange={setCustomer}
              options={[
                ["PROPOSED", "Mới dự kiến / chờ khách phản hồi"],
                ["CONFIRMED", "Đã thống nhất với người liên hệ"],
                ["CHANGE", "Khách đề nghị đổi lịch"],
              ]}
            />
            <p>
              Liên hệ hiện trường: {machine.contact}. Tiếp cận máy 08:00–16:30;
              cần báo bảo vệ trước khi đến.
            </p>
            <Field
              label="Lý do phân công / đổi lịch và căn cứ trao đổi"
              value={reason}
              onChange={setReason}
              required
              type="textarea"
            />
            {conflicts.length > 0 && (
              <Notice>
                <strong>
                  Trùng lịch với {conflicts.map((row) => row.code).join(", ")}
                </strong>
                <p>
                  Chọn người hoặc khung giờ khác trước khi xác nhận. Không dựa
                  riêng vào nhãn “sẵn sàng”.
                </p>
              </Notice>
            )}
            {!valid && (
              <p role="alert">Kết thúc phải sau bắt đầu và cần đủ ngày/giờ.</p>
            )}
            <ReviewAction
              label="Đọc lại phương án điều phối"
              disabled={!valid || conflicts.length > 0 || !reason.trim()}
              onConfirm={() => setReceipt(true)}
            >
              <p>
                {tech} · {day} {start}–{end}, UTC+7 ·{" "}
                {customer === "CONFIRMED"
                  ? "Khách đã thống nhất"
                  : "Cần tiếp tục thống nhất lịch với khách"}
                .
              </p>
              <p>{reason}</p>
              <p>
                Thay đổi được ghi lịch sử và thông báo tới người có liên quan
                khi kết nối hệ thống.
              </p>
            </ReviewAction>
          </Form>
        </Card>
      </div>
      {receipt && (
        <Receipt title="Đã ghi phương án điều phối mẫu">
          <p>
            Lịch dự kiến và xác nhận lịch với khách vẫn là hai thông tin riêng.
            Địa điểm lệnh được giữ cùng hồ sơ.
          </p>
        </Receipt>
      )}
    </>
  );
}

export function StockJourney() {
  const [mode, setMode] = useState("ISSUE"),
    [quantity, setQuantity] = useState("1"),
    [condition, setCondition] = useState("GOOD"),
    [receiver, setReceiver] = useState(""),
    [note, setNote] = useState(""),
    [receipt, setReceipt] = useState(false),
    [error, setError] = useState("");
  const q = decimalHundred(quantity),
    limit = mode === "RETURN" ? 100n : 1000n;
  const valid = q !== null && q > 0n && q % 100n === 0n && q <= limit;
  const available =
    1000n +
    (q ?? 0n) *
      (mode === "ISSUE"
        ? -1n
        : mode === "RETURN" && condition !== "GOOD"
          ? 0n
          : 1n);
  return (
    <>
      <MachineCard />
      <div className="studio-two">
        <Card title="Phiếu giao nhận phụ tùng">
          <Form onSubmit={() => {}}>
            <Choice
              label="Thao tác"
              value={mode}
              onChange={(value) => {
                setMode(value);
                setReceipt(false);
                setError("");
              }}
              options={[
                ["ISSUE", "Xuất cho WO-MẪU-2045"],
                ["RETURN", "Nhận trả từ lần xuất K01"],
                ["RECEIVE", "Nhập phụ tùng"],
                ["ADJUST", "Điều chỉnh tăng theo kiểm kê"],
              ]}
            />
            <p>
              Kho K01 · Cụm ổ bi PT042 · đơn vị bộ (số nguyên). Khả dụng mẫu: 10
              bộ; cách ly: 1 bộ.
            </p>
            {mode === "RETURN" && (
              <Notice>
                Đã xuất 2; đã xác nhận dùng 1; tối đa còn được trả 1. Trả đúng
                kho K01 đã xuất. Kho/phụ tùng ngừng hoạt động vẫn cần được tiếp
                nhận trả theo hồ sơ gốc.
              </Notice>
            )}
            <Field
              label="Số lượng"
              required
              value={quantity}
              onChange={setQuantity}
              hint="Ví dụ 2 nghĩa là hai bộ. Phụ tùng này không cho phép số lẻ."
            />
            {mode === "RETURN" && (
              <Choice
                label="Tình trạng phụ tùng trả"
                value={condition}
                onChange={setCondition}
                options={[
                  ["GOOD", "Tốt, có thể dùng lại"],
                  ["DAMAGED", "Hỏng, đưa cách ly"],
                  ["INSPECTION", "Cần kiểm tra, đưa cách ly"],
                ]}
              />
            )}
            <Field
              label={
                mode === "ISSUE"
                  ? "Người nhận phụ tùng / kỹ thuật viên"
                  : "Người giao phụ tùng"
              }
              required
              value={receiver}
              onChange={setReceiver}
            />
            <Field
              label="Căn cứ, số phiếu hoặc lý do"
              required
              type="textarea"
              value={note}
              onChange={setNote}
            />
            {error && <p role="alert">{error}</p>}
            <button
              className="ws-button"
              type="button"
              onClick={(event) => {
                if (!valid) {
                  setError(
                    "Số lượng cần là số nguyên lớn hơn 0 và không vượt lượng được thao tác.",
                  );
                  return;
                }
                if (event.currentTarget.form?.reportValidity()) {
                  setError("");
                  setReceipt(true);
                }
              }}
            >
              Xem phiếu trước khi ghi nhận
            </button>
          </Form>
        </Card>
        <Card title="Đối soát và tác động tồn">
          <p>
            WO-MẪU-2045 · serial {machine.serial} · đúng kho K01. Không dùng chi
            phí kho làm giá khách đã chấp thuận.
          </p>
          <dl className="sd-facts">
            <div>
              <dt>Khả dụng trước</dt>
              <dd>10 bộ</dd>
            </div>
            <div>
              <dt>Khả dụng dự kiến sau</dt>
              <dd>
                {valid
                  ? `${quantityText(decimalText(available))} bộ`
                  : "Kiểm tra số lượng"}
              </dd>
            </div>
            <div>
              <dt>Cách ly sau</dt>
              <dd>
                {mode === "RETURN" && condition !== "GOOD" && valid
                  ? `${quantityText(decimalText(100n + (q ?? 0n)))} bộ`
                  : "1 bộ"}
              </dd>
            </div>
            <div>
              <dt>Ai đang giữ vật tư</dt>
              <dd>{receiver || "Cần ghi người giao/nhận"}</dd>
            </div>
          </dl>
          <Notice>
            Khi mất phản hồi: giữ đúng phiếu đang chờ, khóa tạo phiếu mới, đọc
            lại kết quả. Không coi làm mới trang là hủy giao dịch đã gửi.
          </Notice>
          <details>
            <summary>Tình huống sửa sai giao dịch</summary>
            <p>
              Chọn phiếu gốc bằng ngày/mã nghiệp vụ, xem trước số lượng và lý do
              sửa. Giữ cả lần ghi nhận và lần điều chỉnh; không xóa dấu vết.
            </p>
          </details>
        </Card>
      </div>
      {receipt && (
        <Receipt title="Phiếu mẫu đang chờ người dùng xác nhận">
          <p>
            {mode === "ISSUE"
              ? "Xuất"
              : mode === "RETURN"
                ? "Nhận trả"
                : "Ghi tăng"}{" "}
            {quantityText(decimalText(q ?? 0n))} bộ PT042 · kho K01 · {receiver}{" "}
            · {note}
          </p>
          <ReviewAction
            label="Đọc lại để xác nhận phiếu mẫu"
            disabled={!valid || !receiver.trim() || !note.trim()}
            onConfirm={() => {
              setReceipt(false);
              setError(
                "Đã hoàn tất phiếu trong phiên thiết kế; không ghi tồn kho thật.",
              );
            }}
          >
            <p>
              Khả dụng dự kiến sau: {quantityText(decimalText(available))} bộ.
              Kiểm tra người giao/nhận, nguồn WO và tình trạng phụ tùng.
            </p>
          </ReviewAction>
        </Receipt>
      )}
    </>
  );
}

export function MaintenanceJourney({ role }: StudioProps) {
  const [first, setFirst] = useState("2027-01-31"),
    [unit, setUnit] = useState("MONTH"),
    [interval, setInterval] = useState("1"),
    [action, setAction] = useState("UPDATE"),
    [reason, setReason] = useState(""),
    [receipt, setReceipt] = useState(false);
  const dates = maintenanceDates(first, unit, Number(interval));
  return (
    <>
      <MachineCard />
      <div className="studio-two">
        <Card title="Lịch giữ ngày gốc">
          <div className="studio-grid">
            <Field
              label="Ngày đến hạn đầu tiên"
              value={first}
              onChange={setFirst}
              type="date"
              required
            />
            <Field
              label="Lặp lại mỗi"
              value={interval}
              onChange={setInterval}
              type="number"
              required
            />
            <Choice
              label="Đơn vị"
              value={unit}
              onChange={setUnit}
              options={[
                ["DAY", "Ngày"],
                ["WEEK", "Tuần"],
                ["MONTH", "Tháng"],
                ["YEAR", "Năm"],
              ]}
            />
          </div>
          <h3>Các kỳ xem trước</h3>
          <ol className="studio-date-preview">
            {dates.map((date, index) => (
              <li key={index}>
                <strong>Kỳ {index + 1}</strong>
                <span>{date.split("-").reverse().join("/")}</span>
              </li>
            ))}
          </ol>
          {!dates.length && (
            <p role="alert">Kiểm tra ngày và chu kỳ nguyên dương.</p>
          )}
          <Notice>
            Hoàn thành muộn không dời ngày gốc. Ngày 31 được co về ngày cuối
            tháng ngắn rồi quay lại ngày 31 khi có thể.
          </Notice>
          <h3>Nội dung và phối hợp</h3>
          <ul>
            <li>Kiểm tra lọc, ổ bi, tiếng rung và thử lại sau vệ sinh.</li>
            <li>
              Thời lượng dự kiến 90 phút; cần người khách hỗ trợ dừng máy.
            </li>
            <li>
              Task quá hạn/không tiếp cận được máy có lý do và người xử lý tiếp.
            </li>
          </ul>
        </Card>
        <Card title="Trước khi thay đổi kế hoạch">
          <Choice
            label="Thay đổi"
            value={action}
            onChange={setAction}
            options={[
              ["UPDATE", "Sửa kỳ chưa sinh"],
              ["PAUSE", "Tạm dừng"],
              ["INACTIVE", "Chấm dứt kế hoạch"],
            ]}
          />
          <p>
            Ví dụ đang có: 1 task đã tạo, 1 WO đang thực hiện. Các hồ sơ này
            được giữ nguyên; không tự hủy theo thay đổi kế hoạch.
          </p>
          <p>
            {action === "INACTIVE"
              ? "Chấm dứt là trạng thái cuối. Cần kế hoạch mới nếu muốn tổ chức chu kỳ khác."
              : action === "PAUSE"
                ? "Tạm dừng sinh kỳ mới; khi tiếp tục cần đọc lại các kỳ đến hạn."
                : "Lịch mới áp dụng kỳ chưa sinh; lịch đã giao cho đội kỹ thuật được xử lý riêng."}
          </p>
          {role === "SERVICE_MANAGER" ? (
            <Form onSubmit={() => {}}>
              <Field
                label="Lý do và phạm vi thay đổi"
                value={reason}
                onChange={setReason}
                required
                type="textarea"
              />
              <ReviewAction
                label="Đọc lại tác động thay đổi"
                disabled={!dates.length}
                onConfirm={() => setReceipt(true)}
              >
                <p>
                  {reason} · Kỳ đầu dự kiến {first}. Giữ nguyên task/WO đã sinh;
                  khách xin dời lịch đến làm không tự đổi hạn bảo trì.
                </p>
              </ReviewAction>
            </Form>
          ) : (
            <Notice>
              Bạn đang đọc kế hoạch và tác động. Quản lý dịch vụ là đầu mối chốt
              thay đổi chu kỳ; lịch đến làm được điều phối riêng.
            </Notice>
          )}
          <details>
            <summary>Task thất bại / lệnh thay thế</summary>
            <p>
              Xem nguyên nhân, các lần làm trước, người chịu trách nhiệm và lệnh
              thay thế đang chờ tạo. Không trình bày mã dự kiến như WO đã tồn
              tại.
            </p>
          </details>
        </Card>
      </div>
      {receipt && (
        <Receipt title="Đã ghi thay đổi kế hoạch mẫu">
          <p>Lưu lý do và mốc áp dụng, theo dõi task/WO cũ độc lập.</p>
        </Receipt>
      )}
    </>
  );
}

const serviceCases = [
  {
    id: "SR-MẪU-2048",
    customer: "An Phú",
    machine: "TB-042",
    branch: "Miền Trung",
    owner: "Minh",
    waiting: "Khách bổ sung",
    age: 4,
    repeat: true,
    created: "2026-11-04",
  },
  {
    id: "SR-MẪU-2051",
    customer: "Bình An",
    machine: "TB-051",
    branch: "Miền Trung",
    owner: "Lan",
    waiting: "Kho đối soát",
    age: 2,
    repeat: false,
    created: "2026-11-06",
  },
  {
    id: "SR-MẪU-2053",
    customer: "An Phú",
    machine: "TB-088",
    branch: "Miền Nam",
    owner: "Minh",
    waiting: "Xem lại kết quả",
    age: 1,
    repeat: true,
    created: "2026-11-07",
  },
];
export function ManagementJourney({ role }: StudioProps) {
  const platform = role === "PLATFORM_ADMIN";
  const [branch, setBranch] = useState("ALL"),
    [group, setGroup] = useState("ALL"),
    [from, setFrom] = useState("2026-11-01"),
    [to, setTo] = useState("2026-11-08"),
    [detail, setDetail] = useState("");
  const cases = serviceCases.filter(
    (row) =>
      (branch === "ALL" || row.branch === branch) &&
      row.created >= from &&
      row.created <= to,
  );
  const rows = cases.filter((row) => group !== "REPEAT" || row.repeat);
  const [tenantState, setTenantState] = useState("PENDING"),
    [reason, setReason] = useState(""),
    [audit, setAudit] = useState<string[]>([
      "Tạo tenant mẫu; chưa có quản trị viên kích hoạt.",
    ]);
  return platform ? (
    <div className="studio-two">
      <Card title="Vòng đời tenant">
        <p>
          Thiết bị An Phú · mã ANPHU · Không hiển thị hồ sơ khách hàng/WO của
          tenant vào trang quản trị nền tảng.
        </p>
        <ol>
          <li>Đã tạo tenant.</li>
          <li>
            {tenantState === "PENDING"
              ? "Chờ Tenant Admin kích hoạt lời mời"
              : "Tenant Admin đã kích hoạt (mẫu)"}
          </li>
          <li>Thiết lập chi nhánh và người dùng thuộc trách nhiệm tenant.</li>
        </ol>
        <Choice
          label="Trạng thái tenant mẫu"
          value={tenantState}
          onChange={setTenantState}
          options={[
            ["PENDING", "Chờ kích hoạt"],
            ["ACTIVE", "Đang sử dụng"],
            ["SUSPENDED", "Tạm khóa"],
          ]}
        />
        <Form onSubmit={() => {}}>
          <Field
            label="Lý do quản trị / căn cứ hỗ trợ"
            value={reason}
            onChange={setReason}
            required
            type="textarea"
          />
          <ReviewAction
            label="Đọc lại ảnh hưởng đổi trạng thái"
            onConfirm={() =>
              setAudit((old) => [
                ...old,
                `Trạng thái ${tenantState === "SUSPENDED" ? "tạm khóa" : tenantState === "ACTIVE" ? "đang sử dụng" : "chờ kích hoạt"} · ${reason}`,
              ])
            }
          >
            <p>
              Ảnh hưởng tới khả năng truy cập của tài khoản tenant; dữ liệu lịch
              sử được giữ. Kiểm tra tenant, lý do và người được thông báo trước
              khi xác nhận.
            </p>
          </ReviewAction>
        </Form>
      </Card>
      <Card title="Nhật ký quản trị">
        <ol>
          {audit.map((entry, index) => (
            <li key={index}>{entry}</li>
          ))}
        </ol>
        <p>
          Lời mời quản trị viên hết hạn cần luồng gửi lại có hạn hiệu lực mới,
          giữ lịch sử các lần gửi.
        </p>
      </Card>
    </div>
  ) : (
    <>
      <div className="studio-grid">
        <Choice
          label="Chi nhánh"
          value={branch}
          onChange={setBranch}
          options={[
            ["ALL", "Toàn doanh nghiệp"],
            ["Miền Trung", "Miền Trung"],
            ["Miền Nam", "Miền Nam"],
          ]}
        />
        <Field label="Từ ngày" type="date" value={from} onChange={setFrom} />
        <Field label="Đến hết ngày" type="date" value={to} onChange={setTo} />
      </div>
      <div className="workshop-signals">
        <button aria-pressed={group === "ALL"} onClick={() => setGroup("ALL")}>
          <strong>{cases.length}</strong>
          <span>Hồ sơ cần theo dõi</span>
        </button>
        <button
          aria-pressed={group === "REPEAT"}
          onClick={() => setGroup("REPEAT")}
        >
          <strong>{cases.filter((row) => row.repeat).length}</strong>
          <span>Hồ sơ có sự cố lặp</span>
        </button>
        <button onClick={() => setGroup("ALL")}>
          <strong>{new Set(cases.map((row) => row.customer)).size}</strong>
          <span>Khách hàng trong nhóm đang xem</span>
        </button>
      </div>
      <Card title="Từ số liệu đi đến việc cần can thiệp">
        <p>
          Kỳ mẫu; số liệu được tính từ danh sách bên dưới. Chưa gọi đây là tỷ lệ
          hài lòng hoặc tỷ lệ sửa thành công.
        </p>
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>Hồ sơ / máy</th>
                <th>Khách hàng</th>
                <th>Chờ ai</th>
                <th>Chủ hồ sơ</th>
                <th>Tuổi hồ sơ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button
                      className="ws-text-link"
                      onClick={() => setDetail(row.id)}
                    >
                      {row.id} · {row.machine}
                    </button>
                  </td>
                  <td>{row.customer}</td>
                  <td>{row.waiting}</td>
                  <td>{row.owner}</td>
                  <td>{row.age} ngày (mẫu)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <Notice>
            Không có hồ sơ theo bộ lọc. Không thay bằng số của toàn doanh
            nghiệp.
          </Notice>
        )}
        {detail && (
          <section
            className="studio-confirm"
            aria-label="Hồ sơ nguồn từ báo cáo"
          >
            <h3>{detail}</h3>
            {serviceCases
              .filter((row) => row.id === detail)
              .map((row) => (
                <div key={row.id}>
                  <p>
                    {row.customer} · {row.machine} · chi nhánh {row.branch}
                  </p>
                  <p>
                    Chủ hồ sơ: {row.owner} · đang chờ: {row.waiting} · tuổi hồ
                    sơ: {row.age} ngày trong mẫu.
                  </p>
                  <p>
                    Việc tiếp theo:{" "}
                    {row.waiting === "Kho đối soát"
                      ? "Kho kiểm tra phiếu còn treo; quản lý dịch vụ theo dõi mốc cập nhật."
                      : row.waiting === "Xem lại kết quả"
                        ? "Đọc kết quả kỹ thuật và phản hồi khách; giữ phần việc còn lại."
                        : "Khách bổ sung ảnh mã lỗi; chủ hồ sơ đọc lại trước khi chốt phạm vi."}
                  </p>
                  <p>
                    {row.repeat
                      ? "Sự cố có liên kết lần trước; cần xem nguyên nhân và phạm vi đã làm."
                      : "Chưa có cờ sự cố lặp trong mẫu; không chứng minh máy chưa từng có lỗi."}
                  </p>
                </div>
              ))}
            <button type="button" onClick={() => setDetail("")}>
              Đóng hồ sơ nguồn
            </button>
          </section>
        )}
      </Card>
    </>
  );
}

export function AccountsJourney({ role }: StudioProps) {
  const [newRole, setNewRole] = useState(
    role === "CUSTOMER_ADMIN"
      ? "CUSTOMER_USER"
      : role === "PLATFORM_ADMIN"
        ? "TENANT_ADMIN"
        : "TECHNICIAN",
  );
  const options: [string, string][] =
    role === "CUSTOMER_ADMIN"
      ? [
          ["CUSTOMER_USER", "Người dùng khách hàng"],
          ["CUSTOMER_ADMIN", "Quản trị khách hàng"],
        ]
      : role === "PLATFORM_ADMIN"
        ? [["TENANT_ADMIN", "Quản trị doanh nghiệp"]]
        : [
            ["SERVICE_MANAGER", "Quản lý dịch vụ"],
            ["DISPATCHER", "Điều phối viên"],
            ["TECHNICIAN", "Kỹ thuật viên"],
            ["INVENTORY_STAFF", "Nhân viên kho"],
          ];
  const [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [task, setTask] = useState("INVITE"),
    [reason, setReason] = useState(""),
    [receipt, setReceipt] = useState("");
  const admin = ["TENANT_ADMIN", "CUSTOMER_ADMIN", "PLATFORM_ADMIN"].includes(
    role,
  );
  const inviteRole =
    role === "CUSTOMER_ADMIN"
      ? "Người dùng khách hàng"
      : role === "PLATFORM_ADMIN"
        ? "Tenant Admin của ANPHU"
        : "Kỹ thuật viên nội bộ";
  return (
    <div className="studio-two">
      <Card title="Khôi phục truy cập và thông tin liên hệ">
        <Form
          onSubmit={() => setReceipt("Đã mô phỏng yêu cầu hướng dẫn khôi phục")}
        >
          <Field
            label="Email nhận hướng dẫn"
            value={email}
            onChange={setEmail}
            type="email"
            required
          />
          <button className="ws-button">
            Yêu cầu hướng dẫn khôi phục (mẫu)
          </button>
          <p>
            Thông báo không tiết lộ tài khoản có tồn tại hay không. Studio không
            gửi email hoặc thay mật khẩu.
          </p>
        </Form>
        <Field label="Họ tên trên hồ sơ" value={name} onChange={setName} />
        <Field
          label="Số liên hệ"
          value={phone}
          onChange={setPhone}
          type="tel"
        />
        <ReviewAction
          label="Xem trước cập nhật thông tin"
          disabled={!name.trim()}
          onConfirm={() => setReceipt("Đã cập nhật hồ sơ mẫu")}
        >
          <p>
            {name} · {phone || "Chưa có số liên hệ"}. Thay liên hệ không tự đổi
            quyền.
          </p>
        </ReviewAction>
      </Card>
      <Card title="Lời mời, quyền và tác động">
        {admin ? (
          <>
            <Choice
              label="Tình huống cần xử lý"
              value={task}
              onChange={setTask}
              options={[
                ["INVITE", "Lời mời mới"],
                ["EXPIRED", "Lời mời đã hết hạn"],
                ["USED", "Lời mời đã được dùng"],
                ["SUSPEND", "Tạm khóa tài khoản"],
                ["ROLE", "Thay vai trò cố định"],
              ]}
            />
            <p>
              Phạm vi mẫu: {inviteRole}. Chỉ sử dụng các role đã được nền tảng
              định nghĩa.
            </p>
            {task === "USED" ? (
              <Notice>
                Lời mời này đã được dùng. Chuyển sang hồ sơ tài khoản; không tạo
                người dùng trùng hoặc gửi lại link cũ.
              </Notice>
            ) : (
              <Form onSubmit={() => {}}>
                {task === "ROLE" && (
                  <>
                    <Choice
                      label="Vai trò sau thay đổi"
                      value={newRole}
                      onChange={setNewRole}
                      options={options}
                    />
                    <Notice>
                      Trước: {inviteRole}. Sau:{" "}
                      {options.find(([key]) => key === newRole)?.[1]}.{" "}
                      {newRole === "TECHNICIAN"
                        ? "Thực hiện và báo cáo các lệnh được phân công."
                        : newRole === "DISPATCHER"
                          ? "Điều phối và cập nhật lịch; không tự chấp thuận chi phí thay khách."
                          : newRole === "SERVICE_MANAGER"
                            ? "Xem xét yêu cầu, bảo hành và trách nhiệm dịch vụ."
                            : newRole === "INVENTORY_STAFF"
                              ? "Ghi nhận tồn và giao dịch kho; không tự đóng yêu cầu của khách."
                              : newRole === "CUSTOMER_ADMIN"
                                ? "Quản trị tài khoản và phản hồi quyết định trong doanh nghiệp khách hàng."
                                : newRole === "CUSTOMER_USER"
                                  ? "Gửi và theo dõi yêu cầu trong phạm vi được cấp; mất thao tác quản trị khách nếu trước đó được cấp."
                                  : "Quản trị người dùng và tổ chức trong đúng tenant."}
                    </Notice>
                  </>
                )}
                <Field
                  label="Email người được mời / tài khoản tác động"
                  value={email}
                  onChange={setEmail}
                  required
                  type="email"
                />
                <Field
                  label="Lý do / nội dung bàn giao"
                  value={reason}
                  onChange={setReason}
                  required
                  type="textarea"
                />
                <ReviewAction
                  label={
                    task === "EXPIRED"
                      ? "Đọc lại trước khi gửi lời mời mới"
                      : "Đọc lại trước khi xác nhận"
                  }
                  onConfirm={() =>
                    setReceipt(
                      task === "SUSPEND"
                        ? "Đã mô phỏng tạm khóa tài khoản"
                        : "Đã ghi thao tác quản trị mẫu",
                    )
                  }
                >
                  <p>
                    {email} · {inviteRole} · {reason}
                  </p>
                  {task === "ROLE" && (
                    <p>
                      Vai trò dự kiến:{" "}
                      {options.find(([key]) => key === newRole)?.[1]}. Kiểm tra
                      việc đang phụ trách, người tiếp nhận và các quyền mất đi
                      trước khi áp dụng.
                    </p>
                  )}
                  <p>
                    {task === "SUSPEND"
                      ? "Tài khoản sẽ không tiếp tục truy cập; lịch sử được giữ. Cần bàn giao việc đang mở cho người có quyền trước khi khóa."
                      : task === "ROLE"
                        ? "Xem quyền được thêm/bớt và hồ sơ đang phụ trách. Không tự sửa quyền chính mình hoặc nâng quyền ngoài phạm vi."
                        : "Lời mời có hạn mới và trạng thái gửi riêng; lỗi gửi không đồng nghĩa tạo thêm tenant/người dùng."}
                  </p>
                </ReviewAction>
              </Form>
            )}
          </>
        ) : (
          <Notice>
            Bạn có thể xem hồ sơ cá nhân và yêu cầu hỗ trợ truy cập. Mời, khóa
            hoặc đổi role thuộc quản trị viên trong đúng phạm vi doanh nghiệp.
          </Notice>
        )}
        {receipt && (
          <Receipt title={receipt}>
            <p>
              Đây là phản hồi trong bản thiết kế, chưa gửi thông tin hay đổi
              quyền thật.
            </p>
          </Receipt>
        )}
      </Card>
    </div>
  );
}

const documents = [
  {
    id: "manual",
    name: "Hướng dẫn WP-200",
    version: "v1",
    source: "Model thiết bị",
    audience: "CUSTOMER",
  },
  {
    id: "handover",
    name: "Biên bản BG-MẪU-0042",
    version: "v2 đã gửi",
    source: "Bàn giao",
    audience: "CUSTOMER",
  },
  {
    id: "warranty",
    name: "Điều khoản bảo hành",
    version: "Bản áp dụng 19/03/2026",
    source: "Hồ sơ máy",
    audience: "CUSTOMER",
  },
  {
    id: "internal",
    name: "Ghi chú chẩn đoán nội bộ",
    version: "v1",
    source: "WO-MẪU-2045",
    audience: "INTERNAL",
  },
];
export function DocumentsJourney({ role }: StudioProps) {
  const [view, setView] = useState("DOCUMENTS"),
    [filter, setFilter] = useState("ALL"),
    [opened, setOpened] = useState("");
  const customer = role.startsWith("CUSTOMER");
  const rows = documents.filter(
    (row) =>
      (!customer || row.audience === "CUSTOMER") &&
      (filter === "ALL" || row.source === filter),
  );
  function downloadSample() {
    const blob = new Blob(
      [
        `BẢN MINH HỌA, KHÔNG PHẢI BIÊN BẢN THẬT\n${opened}\n${machine.code} / ${machine.serial}`,
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bien-ban-minh-hoa.txt";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <MachineCard />
      <Choice
        label="Nội dung"
        value={view}
        onChange={setView}
        options={[
          ["DOCUMENTS", "Thư viện tài liệu của máy"],
          ["NOTICES", "Thông báo cần hành động"],
          ["HISTORY", "Lịch sử toàn máy và từng hồ sơ"],
        ]}
      />
      {view === "DOCUMENTS" ? (
        <Card title="Tìm đúng bản tài liệu">
          <Choice
            label="Nguồn tài liệu"
            value={filter}
            onChange={setFilter}
            options={[
              ["ALL", "Tất cả nguồn"],
              ["Model thiết bị", "Model thiết bị"],
              ["Bàn giao", "Bàn giao"],
              ["Hồ sơ máy", "Hồ sơ máy"],
              ...(!customer
                ? ([["WO-MẪU-2045", "Công việc kỹ thuật"]] as [
                    string,
                    string,
                  ][])
                : []),
            ]}
          />
          <ul className="studio-documents">
            {rows.map((row) => (
              <li key={row.id}>
                <strong>{row.name}</strong>
                <span>
                  {row.version} · {row.source} ·{" "}
                  {row.audience === "CUSTOMER"
                    ? "Đã công bố cho khách"
                    : "Chỉ nội bộ"}
                </span>
                <button
                  onClick={() => setOpened(`${row.name} · ${row.version}`)}
                >
                  Đọc đúng phiên bản
                </button>
              </li>
            ))}
          </ul>
          {!rows.length && (
            <Notice>
              Không có tài liệu công bố theo bộ lọc; không suy ra hồ sơ nội bộ
              không tồn tại.
            </Notice>
          )}
          {opened && (
            <section className="studio-confirm">
              <h3>{opened}</h3>
              <p>
                Nội dung minh họa cho máy {machine.serial}. Khi kết nối hệ
                thống, hiển thị tác giả/ngày công bố, bản áp dụng và hồ sơ
                nguồn.
              </p>
              <button onClick={downloadSample}>Tải bản minh họa TXT</button>
              <button onClick={() => window.print()}>
                In nội dung đang xem
              </button>
            </section>
          )}
        </Card>
      ) : view === "NOTICES" ? (
        <Card title="Từ thông báo đến đúng việc">
          <h3>Dự toán bản 2 đang chờ phản hồi</h3>
          <p>
            SR-MẪU-2048 · TB-042 · Công ty An Phú. Customer Admin cần xem thay
            đổi và phản hồi trước hạn hiệu lực.
          </p>
          <button
            onClick={() =>
              setOpened(
                "Dự toán bản 2 của SR-MẪU-2048 — mở đúng mục chi phí khi kết nối",
              )
            }
          >
            Xem nội dung cần quyết định
          </button>
          {opened && <Notice>{opened}</Notice>}
          <p>
            Đánh dấu đã đọc không có nghĩa đã chấp thuận. Thông báo cũ cần cho
            biết hồ sơ đã đổi trạng thái khi mở.
          </p>
        </Card>
      ) : (
        <HistoryJourney role={role} />
      )}
    </>
  );
}
