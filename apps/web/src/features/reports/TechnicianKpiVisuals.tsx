import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDirectory } from "../../routes/registration-data";
import "../workspace/management.css";

type Item = {
  technicianId: string;
  fullName: string | null;
  employeeCode: string;
  completedCount: number;
  onTimeRate: number | null;
  averageMttrHours?: number | null;
  firstTimeFixRate?: number | null;
};
type Drilldown = {
  total: number;
  items: {
    id: string;
    workOrderNo: string;
    title: string;
    completedAt: string;
    durationHours: number | null;
    isOnTime: boolean | null;
    isFirstTimeFix: boolean | null;
    customerName: string | null;
  }[];
};
const percent = (value: number | null | undefined) =>
  value == null
    ? "Chưa đủ dữ liệu"
    : `${(value * 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;

export default function TechnicianKpiVisuals({
  items,
  from,
  to,
}: {
  items: Item[];
  from: string;
  to: string;
}) {
  const [technicianId, setTechnicianId] = useState("");
  const ranked = [...items].sort(
    (a, b) =>
      b.completedCount - a.completedCount ||
      a.employeeCode.localeCompare(b.employeeCode),
  );
  const chart = ranked.map((item) => ({
    name: item.fullName || item.employeeCode,
    "Lệnh hoàn tất": item.completedCount,
    "Đúng hạn (%)":
      item.onTimeRate == null
        ? null
        : Math.round(item.onTimeRate * 10000) / 100,
  }));
  const selected = items.find((item) => item.technicianId === technicianId);
  const detail = useDirectory<Drilldown>(
    "workorders",
    selected
      ? `/reports/technicians/${selected.technicianId}/work-orders?${new URLSearchParams({ from, to })}`
      : null,
  );
  return (
    <>
      <div
        className="management-chart"
        role="img"
        aria-label="So sánh số lệnh hoàn tất và tỷ lệ đúng hạn của kỹ thuật viên; số liệu đầy đủ trong bảng bên dưới"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart} margin={{ bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              interval={0}
              angle={-15}
              textAnchor="end"
            />
            <YAxis yAxisId="count" allowDecimals={false} />
            <YAxis
              yAxisId="rate"
              orientation="right"
              domain={[0, 100]}
              unit="%"
            />
            <Tooltip />
            <Legend />
            <Bar
              yAxisId="count"
              dataKey="Lệnh hoàn tất"
              fill="#2563eb"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              yAxisId="rate"
              dataKey="Đúng hạn (%)"
              fill="#14b8a6"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <h3>So sánh kỹ thuật viên</h3>
      <p>
        Xếp theo số lệnh hoàn tất trong kỳ. MTTR tính theo giờ; FTFR phản ánh ca
        sửa được giải quyết và không phải lệnh thay thế, theo dữ liệu báo cáo
        hiện có.
      </p>
      <div className="live-table">
        <table>
          <thead>
            <tr>
              <th>Thứ tự theo khối lượng</th>
              <th>Kỹ thuật viên</th>
              <th>Hoàn tất</th>
              <th>Đúng hạn</th>
              <th>MTTR</th>
              <th>FTFR</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((item, index) => (
              <tr key={item.technicianId}>
                <td>{index + 1}</td>
                <td>
                  <button
                    type="button"
                    className="management-link-button"
                    onClick={() => setTechnicianId(item.technicianId)}
                  >
                    {item.fullName || item.employeeCode} · {item.employeeCode}
                  </button>
                </td>
                <td>{item.completedCount}</td>
                <td>{percent(item.onTimeRate)}</td>
                <td>
                  {item.averageMttrHours == null
                    ? "Chưa đủ dữ liệu"
                    : `${item.averageMttrHours.toLocaleString("vi-VN")} giờ`}
                </td>
                <td>{percent(item.firstTimeFixRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <section
          className="management-quickview"
          aria-label="Chi tiết các ca của kỹ thuật viên"
        >
          <div className="management-heading">
            <h3>
              {selected.fullName || selected.employeeCode} · Các ca hoàn tất
              trong kỳ
            </h3>
            <button type="button" onClick={() => setTechnicianId("")}>
              Đóng chi tiết
            </button>
          </div>
          {detail.loading && <p role="status">Đang tải các ca…</p>}
          {detail.error && (
            <p role="alert" className="m1-error">
              {detail.error}
            </p>
          )}
          {detail.value && (
            <>
              <p>{detail.value.total} ca theo đúng khoảng ngày đã chọn.</p>
              <ul className="m2-linked-list">
                {detail.value.items.map((order) => (
                  <li key={order.id}>
                    <div>
                      <Link to={`/app/work-orders/${order.id}`}>
                        {order.workOrderNo} · {order.title}
                      </Link>
                      <p>
                        {order.customerName || "Tên khách hàng chưa sẵn sàng"} ·{" "}
                        {new Date(order.completedAt).toLocaleString("vi-VN", {
                          timeZone: "Asia/Ho_Chi_Minh",
                        })}
                      </p>
                    </div>
                    <span>
                      {order.durationHours == null
                        ? "Chưa đủ thời gian"
                        : `${order.durationHours} giờ`}{" "}
                      ·{" "}
                      {order.isOnTime == null
                        ? "Chưa có hạn hẹn"
                        : order.isOnTime
                          ? "Đúng hạn"
                          : "Trễ hạn"}
                    </span>
                  </li>
                ))}
              </ul>
              {!detail.value.items.length && (
                <p>Không có ca hoàn tất trong kỳ.</p>
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}
