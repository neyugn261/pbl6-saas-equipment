import { DataState } from "./WorkspaceUI";
import { useState } from "react";
import { asRow, formatDate, useWorkspaceData, value } from "./workspace-data";
import { serviceLabels } from "./service-detail-data";
import type { Row } from "./workspace-data";

export default function RequestCoveragePreview({
  requestId,
}: {
  requestId: string;
}) {
  const [revision, refresh] = useState(0);
  const data = useWorkspaceData<Row>(
    "requestsLive",
    `/service-requests/${requestId}`,
    revision,
  );
  const assessment = asRow(data.data?.coverageAssessment),
    check = asRow(data.data?.warrantyCheck);
  return (
    <div className="workshop-coverage">
      <h3>Đánh giá bảo hành của sự cố</h3>
      <DataState {...data} retry={() => refresh((v) => v + 1)}>
        <strong>
          {assessment.decision
            ? (serviceLabels[String(assessment.decision)] ??
              "Xem kết luận trong hồ sơ")
            : data.data?.assessmentRequired
              ? "Chưa có kết luận áp dụng cho sự cố"
              : "Đối chiếu kết quả theo quy trình bảo hành hiện hành"}
        </strong>
        <p>
          {value(
            assessment.reason,
            "Chưa có lý do đánh giá được ghi nhận cho sự cố này.",
          )}
        </p>
        <small>
          Theo thời hạn:{" "}
          {serviceLabels[String(check.result)] ?? "Chưa kiểm tra"} · Kiểm tra{" "}
          {formatDate(check.checkedAt, true)}
        </small>
        {typeof data.data?.nextAction === "string" && <p><strong>Bước tiếp theo: </strong>{data.data.nextAction}</p>}
      </DataState>
    </div>
  );
}
