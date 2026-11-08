import { useState } from "react";
import { Card, Choice, Field, Notice } from "./StudioUI";
import type { StudioProps } from "./WorkshopDesignStudio";

const history = [
  {
    id: "h1",
    date: "2026-03-19",
    source: "Bàn giao",
    record: "BG-MẪU-0042 v2",
    event: "Chấp thuận bàn giao",
    detail:
      "Khách đọc bản v2; serial WP-0862, thời hạn bảo hành 19/03/2026–18/03/2027 được giữ cùng bản gửi.",
    audience: "CUSTOMER",
  },
  {
    id: "h2",
    date: "2026-10-12",
    source: "Bảo trì",
    record: "TASK-MẪU-0021",
    event: "Hoàn thành kiểm tra lọc",
    detail:
      "Task liên kết WO-MẪU-1980. Kiểm tra lọc, vệ sinh và thử lại. Ngày hoàn thành không dời lịch chu kỳ gốc.",
    audience: "CUSTOMER",
  },
  {
    id: "h3",
    date: "2026-11-09",
    source: "Công việc",
    record: "WO-MẪU-2045",
    event: "Báo cáo xử lý một phần",
    detail:
      "Đã thay ổ bi; còn kiểm tra tín hiệu bộ điều khiển. Minh phụ trách thống nhất phần việc tiếp. Không tự khẳng định máy hoạt động hoàn toàn.",
    audience: "CUSTOMER",
  },
  {
    id: "h4",
    date: "2026-11-09",
    source: "Phụ tùng",
    record: "SD-MẪU-0081",
    event: "Xác nhận dùng 1 bộ ổ bi",
    detail:
      "PT042 · WO-MẪU-2045 · xuất 2, dùng 1, trả 1. Lý do thay: ổ bi mòn. Linh kiện cũ đưa cách ly; chưa có điều chỉnh về sau trong mẫu này.",
    audience: "CUSTOMER",
  },
  {
    id: "h5",
    date: "2026-11-09",
    source: "Yêu cầu",
    record: "SR-MẪU-2048",
    event: "Cần khách đọc kết quả",
    detail:
      "Request chờ phản hồi; việc kỹ thuật đã kết thúc nhưng vẫn cần đọc phần chưa làm và mốc cập nhật tiếp theo.",
    audience: "CUSTOMER",
  },
  {
    id: "h6",
    date: "2026-11-09",
    source: "Công việc",
    record: "WO-MẪU-2045",
    event: "Ghi chú chẩn đoán nội bộ",
    detail: "Ghi nhận trao đổi nội bộ về phép đo. Chưa được công bố cho khách.",
    audience: "INTERNAL",
  },
];
export default function HistoryJourney({ role }: StudioProps) {
  const [source, setSource] = useState("ALL"),
    [record, setRecord] = useState("ALL"),
    [query, setQuery] = useState(""),
    [from, setFrom] = useState("2026-01-01"),
    [to, setTo] = useState("2026-12-31"),
    [opened, setOpened] = useState("");
  const accessible = history.filter(
    (row) => !role.startsWith("CUSTOMER") || row.audience === "CUSTOMER",
  );
  const records = accessible.filter(
    (row) => source === "ALL" || row.source === source,
  );
  const rows = records.filter(
    (row) =>
      (record === "ALL" || row.record === record) &&
      (!from || row.date >= from) &&
      (!to || row.date <= to) &&
      `${row.event} ${row.detail}`
        .toLocaleLowerCase("vi")
        .includes(query.toLocaleLowerCase("vi")),
  );
  const current = accessible.find((row) => row.id === opened);
  return (
    <Card title="Lịch sử toàn máy và từng hồ sơ">
      <div className="studio-grid">
        <Choice
          label="Nguồn lịch sử"
          value={source}
          onChange={(value) => {
            setSource(value);
            setRecord("ALL");
            setOpened("");
          }}
          options={[
            ["ALL", "Tất cả nguồn"],
            ...Array.from(new Set(accessible.map((row) => row.source))).map(
              (value) => [value, value] as const,
            ),
          ]}
        />
        <Choice
          label="Hồ sơ cụ thể"
          value={record}
          onChange={(value) => {
            setRecord(value);
            setOpened("");
          }}
          options={[
            ["ALL", "Toàn bộ hồ sơ"],
            ...Array.from(new Set(records.map((row) => row.record))).map(
              (value) => [value, value] as const,
            ),
          ]}
        />
        <Field
          label="Từ ngày lịch sử"
          type="date"
          value={from}
          onChange={setFrom}
        />
        <Field
          label="Đến ngày lịch sử"
          type="date"
          value={to}
          onChange={setTo}
        />
        <Field
          label="Tìm sự kiện hoặc nội dung"
          value={query}
          onChange={setQuery}
        />
      </div>
      {from && to && from > to ? (
        <p role="alert">Ngày kết thúc cần từ ngày bắt đầu trở đi.</p>
      ) : (
        <>
          <p>
            {rows.length} sự kiện theo bộ lọc · dữ liệu minh họa, chưa chứng
            minh đầy đủ lịch sử thật.
          </p>
          <ol className="studio-history">
            {rows.map((row) => (
              <li key={row.id}>
                <span>
                  {row.date.split("-").reverse().join("/")} · {row.source}
                </span>
                <h3>{row.event}</h3>
                <button type="button" onClick={() => setOpened(row.id)}>
                  {row.record} — đọc chi tiết
                </button>
                <small>
                  {row.audience === "CUSTOMER"
                    ? "Đã công bố cho khách"
                    : "Chỉ nội bộ"}
                </small>
              </li>
            ))}
          </ol>
          {!rows.length && (
            <Notice>
              Không có sự kiện theo bộ lọc; không có nghĩa máy chưa từng được
              phục vụ.
            </Notice>
          )}
        </>
      )}
      {current && (
        <section className="studio-confirm" aria-label="Chi tiết sự kiện nguồn">
          <h3>
            {current.record} · {current.event}
          </h3>
          <p>{current.detail}</p>
          <p>
            Ngày {current.date.split("-").reverse().join("/")} · serial WP-0862
            · bản ghi minh họa.
          </p>
          <button type="button" onClick={() => setOpened("")}>
            Đóng chi tiết
          </button>
        </section>
      )}
      <Notice>
        Phạm vi mẫu gồm bàn giao, bảo trì, yêu cầu, công việc và phụ tùng. Mỗi
        nguồn có thể cập nhật khác thời điểm; nguồn chưa tải được phải hiện cảnh
        báo riêng.
      </Notice>
    </Card>
  );
}
