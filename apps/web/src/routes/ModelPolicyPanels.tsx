import { useState } from "react";
import { api } from "../api/client";
import { useSession } from "../auth/session";
import { useDirectory, errorText } from "./registration-data";
import { LoadState } from "./registration-shared";
import type { PolicyItem } from "./ModelPolicyPage";
type Snapshot = {
  warranty: {
    revision: number;
    body: {
      mode: string;
      name: string;
      terms: string;
      reason: string;
      durationMonths: number;
      coveredCauses: string[];
      exclusions: { code: string; text: string }[];
    };
    startDate: string;
    endDate: string;
  };
  maintenance: {
    revision: number;
    body: {
      mode: string;
      name: string;
      terms: string;
      reason: string;
      rules: {
        id: string;
        name: string;
        frequencyValue: number;
        frequencyUnit: string;
        firstOccurrence: number;
        checklist: PolicyItem[];
      }[];
    };
    firstDueDates: { itemId: string; date: string }[];
  };
};
export function ModelPolicySummary({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="live-columns">
      <section>
        <h3>Bảo hành · v{snapshot.warranty.revision}</h3>
        <p>{snapshot.warranty.body.name}</p>
        <p>
          {snapshot.warranty.body.mode === "NONE"
            ? snapshot.warranty.body.reason
            : `${snapshot.warranty.body.durationMonths} tháng · ${snapshot.warranty.startDate} → ${snapshot.warranty.endDate}`}
        </p>
        <p>{snapshot.warranty.body.terms}</p>
        {snapshot.warranty.body.exclusions.map((e) => (
          <p key={e.code}>Loại trừ: {e.text}</p>
        ))}
      </section>
      <section>
        <h3>Bảo trì · v{snapshot.maintenance.revision}</h3>
        <p>{snapshot.maintenance.body.terms}</p>
        {snapshot.maintenance.body.mode === "NONE" ? (
          <p>{snapshot.maintenance.body.reason}</p>
        ) : (
          snapshot.maintenance.body.rules.map((r) => (
            <div key={r.id}>
              <h4>
                {r.name} · mỗi {r.frequencyValue} {r.frequencyUnit}
              </h4>
              <p>
                Kỳ đầu:{" "}
                {
                  snapshot.maintenance.firstDueDates.find(
                    (d) => d.itemId === r.id,
                  )?.date
                }
              </p>
              <ul>
                {r.checklist.map((i) => (
                  <li key={i.id}>
                    <strong>{i.title}</strong> · {i.action}
                    <p>{i.instructions}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
export function HandoverPolicyPanel({
  id,
  version,
  status,
  snapshot,
  changed,
}: {
  id: string;
  version: number;
  status: string;
  snapshot?: Snapshot | null;
  changed: () => void;
}) {
  const { profile } = useSession(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [months, setMonths] = useState(""),
    [reason, setReason] = useState(""),
    [scheduleOverrides, setScheduleOverrides] = useState<
      Record<
        string,
        { itemId: string; frequencyValue: number; firstOccurrence: number }
      >
    >({});
  const canManage = profile?.roles.includes("SERVICE_MANAGER");
  async function run(path: string, body: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.assetM2(`/equipment-registrations/${id}/${path}`, {
        method: "POST",
        body,
      });
      changed();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="m1-card live-admin">
      <h2>Áp dụng chính sách theo Model</h2>
      {error && (
        <p role="alert" className="m1-error">
          {error}
        </p>
      )}
      {snapshot ? (
        <ModelPolicySummary snapshot={snapshot} />
      ) : (
        <p>
          Hệ thống lấy các phiên bản đã công bố và tự tính ngày theo ngày bàn
          giao của thiết bị.
        </p>
      )}
      {!canManage && (
        <p>Service Manager xác nhận và áp dụng chương trình bảo trì.</p>
      )}
      {status === "DRAFT" && canManage && (
        <>
          <form
            className="live-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run("model-policies", {
                expectedVersion: version,
                ...(months ? { durationMonths: Number(months) } : {}),
                ...(Object.keys(scheduleOverrides).length
                  ? { maintenanceOverrides: Object.values(scheduleOverrides) }
                  : {}),
                reason,
              });
            }}
          >
            <label>
              Thay đổi thời hạn bảo hành riêng cho máy này (tùy chọn)
              <input
                type="number"
                min={1}
                max={1200}
                value={months}
                onChange={(e) => setMonths(e.target.value)}
                disabled={busy}
              />
            </label>
            {snapshot?.maintenance.body.rules.map((rule) => (
              <div key={rule.id}>
                <label>
                  Chu kỳ riêng cho {rule.name}
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={
                      scheduleOverrides[rule.id]?.frequencyValue ??
                      rule.frequencyValue
                    }
                    onChange={(e) =>
                      setScheduleOverrides({
                        ...scheduleOverrides,
                        [rule.id]: {
                          itemId: rule.id,
                          frequencyValue: Number(e.target.value),
                          firstOccurrence:
                            scheduleOverrides[rule.id]?.firstOccurrence ??
                            rule.firstOccurrence,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Kỳ đầu sau bao nhiêu chu kỳ?
                  <input
                    type="number"
                    min={1}
                    max={100}
                    disabled={busy}
                    value={
                      scheduleOverrides[rule.id]?.firstOccurrence ??
                      rule.firstOccurrence
                    }
                    onChange={(e) =>
                      setScheduleOverrides({
                        ...scheduleOverrides,
                        [rule.id]: {
                          itemId: rule.id,
                          frequencyValue:
                            scheduleOverrides[rule.id]?.frequencyValue ??
                            rule.frequencyValue,
                          firstOccurrence: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              </div>
            ))}
            {(months || Object.keys(scheduleOverrides).length > 0) && (
              <label>
                Lý do ngoại lệ
                <input
                  required
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={busy}
                />
              </label>
            )}
            <button disabled={busy}>
              {busy
                ? "Đang kiểm tra…"
                : snapshot
                  ? "Xem lại chính sách Model hiện hành"
                  : "Lấy và xem trước chính sách Model"}
            </button>
          </form>
          {snapshot && (
            <button
              disabled={busy}
              onClick={() => void run("submit", { expectedVersion: version })}
            >
              Xác nhận chính sách và hoàn tất bàn giao
            </button>
          )}
        </>
      )}
      {status === "PENDING_MAINTENANCE" && canManage && (
        <button disabled={busy} onClick={() => void run("resume", {})}>
          Đối soát và tiếp tục cùng hồ sơ
        </button>
      )}
    </section>
  );
}
export function AppliedPolicyPanel({ equipmentId }: { equipmentId: string }) {
  const data = useDirectory<{
    snapshot: Snapshot | null;
    state: string;
    legacy: boolean;
    warranties: {
      id: string;
      startDate: string;
      endDate: string;
      terms: string | null;
    }[];
  }>("assetM2", `/equipment/${equipmentId}/applied-policies`);
  return (
    <section className="m1-card">
      <h2>Chính sách dịch vụ đã áp dụng</h2>
      <LoadState {...data} />
      {data.value?.state === "SETUP_PENDING" && (
        <p role="status">
          Bàn giao đang chờ hoàn tất chương trình bảo trì. Điều khoản dưới đây
          đã được xác nhận.
        </p>
      )}
      {data.value?.snapshot ? (
        <ModelPolicySummary snapshot={data.value.snapshot} />
      ) : (
        data.value && (
          <>
            <p>
              Hồ sơ hiện có được ghi nhận theo chính sách riêng; chưa áp dụng
              phiên bản Model.
            </p>
            {data.value.warranties.map((w) => (
              <div key={w.id}>
                <p>
                  {w.startDate} → {w.endDate}
                </p>
                <p>{w.terms}</p>
              </div>
            ))}
          </>
        )
      )}
    </section>
  );
}
interface Result {
  itemId: string;
  status: string;
  note: string;
}
interface Checklist {
  items: PolicyItem[];
  results: Result[];
  version: number;
  canEdit: boolean;
}
export function WorkOrderChecklist({
  id,
  changed,
}: {
  id: string;
  changed: () => void;
}) {
  const [revision, refresh] = useState(0),
    [edited, setEdited] = useState<Result[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const data = useDirectory<Checklist>(
    "workorders",
    `/work-orders/${id}/checklist`,
    revision,
  );
  const results = edited ?? data.value?.results ?? [];
  const update = (itemId: string, patch: Partial<Result>) =>
    setEdited([
      ...results.filter((r) => r.itemId !== itemId),
      {
        ...(results.find((r) => r.itemId === itemId) ?? {
          itemId,
          status: "NOT_DONE",
          note: "",
        }),
        ...patch,
      },
    ]);
  return (
    <section className="m1-card live-admin">
      <h2>Checklist thực hiện</h2>
      <LoadState {...data} />
      {error && (
        <p className="m1-error" role="alert">
          {error}
        </p>
      )}
      {data.value &&
        (!data.value.items.length ? (
          <p>Công việc này không có checklist bắt buộc.</p>
        ) : (
          <>
            <form
              className="live-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (busy) return;
                setBusy(true);
                setError("");
                void api
                  .workorders(`/work-orders/${id}/checklist`, {
                    method: "POST",
                    body: { expectedVersion: data.value!.version, results },
                  })
                  .then(() => {
                    setEdited(null);
                    refresh((v) => v + 1);
                    changed();
                  })
                  .catch((e) => setError(errorText(e)))
                  .finally(() => setBusy(false));
              }}
            >
              <fieldset disabled={busy || !data.value.canEdit}>
                {data.value.items.map((item) => (
                  <section key={item.id}>
                    <h3>
                      {item.title}
                      {item.required ? " *" : ""}
                    </h3>
                    <p>
                      {item.action} · {item.instructions}
                    </p>
                    <label>
                      Kết quả
                      <select
                        value={
                          results.find((r) => r.itemId === item.id)?.status ??
                          "NOT_DONE"
                        }
                        onChange={(e) =>
                          update(item.id, { status: e.target.value })
                        }
                      >
                        <option value="NOT_DONE">Chưa thực hiện</option>
                        <option value="DONE">Đã thực hiện</option>
                        {item.allowNotApplicable && (
                          <option value="NOT_APPLICABLE">
                            Không áp dụng (có lý do)
                          </option>
                        )}
                      </select>
                    </label>
                    <label>
                      Ghi chú nội bộ / lý do không áp dụng
                      <textarea
                        maxLength={2000}
                        value={
                          results.find((r) => r.itemId === item.id)?.note ?? ""
                        }
                        onChange={(e) =>
                          update(item.id, { note: e.target.value })
                        }
                      />
                    </label>
                  </section>
                ))}
                <button>Lưu kết quả checklist</button>
              </fieldset>
            </form>
            <button
              disabled={busy}
              onClick={() => {
                setEdited(null);
                refresh((v) => v + 1);
              }}
            >
              Tải lại kết quả từ máy chủ
            </button>
            <p>
              Các mục bắt buộc phải được lưu hợp lệ trước khi gửi báo cáo hoàn
              tất.
            </p>
          </>
        ))}
    </section>
  );
}
interface RequestCoverage {
  id: string;
  status: string;
  allowedActions: string[];
  assessmentRequired?: boolean;
  assessmentVersion?: number;
  coverageAssessment?: {
    decision: string;
    cause: string;
    reason: string;
  } | null;
  appliedWarrantyPolicy?: {
    terms: string;
    coveredCauses: string[];
    exclusions: { code: string; text: string }[];
  } | null;
}
export function WarrantyAssessmentPanel({
  request,
  changed,
}: {
  request: RequestCoverage;
  changed: () => void;
}) {
  const [cause, setCause] = useState("MANUFACTURING_DEFECT"),
    [decision, setDecision] = useState("COVERED"),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="m1-card live-admin">
      <h2>Phạm vi bảo hành của sự cố</h2>
      <p>
        {request.coverageAssessment
          ? `${request.coverageAssessment.decision === "COVERED" ? "Được bảo hành" : "Không thuộc phạm vi bảo hành"} · ${request.coverageAssessment.reason}`
          : request.assessmentRequired
            ? "Chưa kết luận. Còn thời hạn không đồng nghĩa sự cố được bảo hành."
            : "Hồ sơ bảo hành được ghi nhận theo luồng hiện hành."}
      </p>
      {request.appliedWarrantyPolicy && (
        <>
          <p>{request.appliedWarrantyPolicy.terms}</p>
          <ul>
            {request.appliedWarrantyPolicy.exclusions.map((e) => (
              <li key={e.code}>
                {e.code} · {e.text}
              </li>
            ))}
          </ul>
        </>
      )}
      {error && (
        <p className="m1-error" role="alert">
          {error}
        </p>
      )}
      {request.allowedActions.includes("assess-warranty") && (
        <form
          className="live-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            void api
              .requestsLive(
                `/service-requests/${request.id}/warranty-assessment`,
                {
                  method: "POST",
                  body: {
                    expectedVersion: request.assessmentVersion ?? 0,
                    cause,
                    decision,
                    reason,
                  },
                },
              )
              .then(changed)
              .catch((e) => setError(errorText(e)))
              .finally(() => setBusy(false));
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Nguyên nhân
              <select value={cause} onChange={(e) => setCause(e.target.value)}>
                {[
                  "MANUFACTURING_DEFECT",
                  "ACCIDENTAL_DAMAGE",
                  "LIQUID_INGRESS",
                  "MISUSE",
                  "WEAR_AND_TEAR",
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Kết luận
              <select
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
              >
                <option value="COVERED">Được bảo hành</option>
                <option value="NOT_COVERED">
                  Không thuộc phạm vi bảo hành
                </option>
              </select>
            </label>
            <label>
              Lý do / bằng chứng đã kiểm tra
              <textarea
                required
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button>Lưu kết luận</button>
          </fieldset>
        </form>
      )}
    </section>
  );
}

export function MaintenancePolicyDetails({
  record,
}: {
  record: Record<string, unknown>;
}) {
  if (!record.policyVersionId) return null;
  const items = Array.isArray(record.checklist)
    ? (record.checklist as PolicyItem[])
    : [];
  const summary = record.completionSummary as {
    summary?: string;
    checklist?: { itemId: string; title: string; status: string }[];
  } | null;
  return (
    <section className="m1-card">
      <h2>Nội dung bảo trì đã áp dụng</h2>
      <p>{String(record.instructionTitle ?? record.name ?? "")}</p>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.title}</strong> · {item.action}
            <p>{item.instructions}</p>
          </li>
        ))}
      </ul>
      {summary && (
        <>
          <h3>Kết quả thực hiện</h3>
          <p>{summary.summary}</p>
          <ul>
            {summary.checklist?.map((item) => (
              <li key={item.itemId}>
                {item.title} ·{" "}
                {item.status === "DONE"
                  ? "Đã thực hiện"
                  : item.status === "NOT_APPLICABLE"
                    ? "Không áp dụng"
                    : "Chưa thực hiện"}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
