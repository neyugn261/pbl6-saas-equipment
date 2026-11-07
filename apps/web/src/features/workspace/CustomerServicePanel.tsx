import { useState } from "react";
import { Link } from "react-router-dom";
import type { Page } from "../../types/domain";
import { Badge, DataState, EmptyState, Pagination } from "./WorkspaceUI";
import { useWorkspaceData, value, type Row } from "./workspace-data";
import { ServiceCard } from "./ServiceDetailUI";

export default function CustomerServicePanel({
  customerId,
}: {
  customerId: string;
}) {
  const [page, setPage] = useState(1),
    [requestPage, setRequestPage] = useState(1),
    [revision, setRevision] = useState(0);
  const equipment = useWorkspaceData<Page<Row>>(
    "assetM2",
    `/equipment?customerId=${customerId}&page=${page}&pageSize=20`,
    revision,
  );
  const requests = useWorkspaceData<Page<Row>>(
    "requestsLive",
    `/service-requests?customerId=${customerId}&page=${requestPage}&pageSize=20`,
    revision,
  );
  const retry = () => setRevision((v) => v + 1);
  return (
    <div className="sd-stack">
      <ServiceCard
        title="Thiết bị của khách hàng"
        description="Chọn thiết bị để xem bảo hành, địa điểm và lịch sử tác động."
      >
        <DataState
          loading={equipment.loading}
          error={equipment.error}
          retry={retry}
        >
          {equipment.data?.items.length ? (
            <>
              <ul className="m2-linked-list">
                {equipment.data.items.map((row) => (
                  <li key={String(row.id)}>
                    <div>
                      <Link to={`/app/equipment/${row.id}`}>
                        {value(row.displayName, value(row.assetCode))}
                      </Link>
                      <p>
                        {value(row.assetCode)} · Serial{" "}
                        {value(row.serialNumber)}
                      </p>
                    </div>
                    <Badge status={row.status} />
                  </li>
                ))}
              </ul>
              <Pagination
                page={page}
                total={equipment.data.total}
                onChange={setPage}
              />
            </>
          ) : (
            <EmptyState
              title="Chưa có thiết bị"
              description="Thiết bị sẽ xuất hiện sau khi ghi nhận bàn giao cho khách hàng này."
            />
          )}
        </DataState>
      </ServiceCard>
      <ServiceCard
        title="Yêu cầu dịch vụ"
        description="Theo dõi các yêu cầu của khách hàng trên mọi thiết bị."
      >
        <DataState
          loading={requests.loading}
          error={requests.error}
          retry={retry}
        >
          {requests.data?.items.length ? (
            <>
              <ul className="m2-linked-list">
                {requests.data.items.map((row) => (
                  <li key={String(row.id)}>
                    <div>
                      <Link to={`/app/service-requests/${row.id}`}>
                        {value(row.requestNo)} · {value(row.title)}
                      </Link>
                    </div>
                    <Badge status={row.status} />
                  </li>
                ))}
              </ul>
              <Pagination
                page={requestPage}
                total={requests.data.total}
                onChange={setRequestPage}
              />
            </>
          ) : (
            <EmptyState
              title="Chưa có yêu cầu dịch vụ"
              description="Các yêu cầu sẽ xuất hiện khi khách hàng hoặc nhân viên gửi hỗ trợ."
            />
          )}
        </DataState>
      </ServiceCard>
    </div>
  );
}
export function RequestLinkedOrders({ requestId }: { requestId: string }) {
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(1);
  const data = useWorkspaceData<Page<Row>>(
    "workorders",
    `/work-orders?serviceRequestId=${requestId}&page=${page}&pageSize=20`,
    revision,
  );
  return (
    <ServiceCard title="Lệnh xử lý liên quan">
      <DataState
        loading={data.loading}
        error={data.error}
        retry={() => setRevision((v) => v + 1)}
      >
        {data.data?.items.length ? (
          <>
            <ul className="m2-linked-list">
              {data.data.items.map((row) => (
                <li key={String(row.id)}>
                  <Link to={`/app/work-orders/${row.id}`}>
                    {value(row.workOrderNo)}
                  </Link>
                  <Badge status={row.status} />
                </li>
              ))}
            </ul>
            <Pagination
              page={page}
              total={data.data.total}
              onChange={setPage}
            />
          </>
        ) : (
          <p>Chưa có lệnh công việc được tạo từ yêu cầu này.</p>
        )}
      </DataState>
    </ServiceCard>
  );
}
