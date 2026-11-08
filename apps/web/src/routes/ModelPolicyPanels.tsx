import { serviceLabels } from "../features/workspace/service-detail-data";
import { useRef, useState } from "react";
import { api } from "../api/client";
import { useSession } from "../auth/session";
import { useDirectory, errorText, modelSetupError } from "./registration-data";
import { LoadState } from "./registration-shared";
import type { PolicyItem } from "./ModelPolicyPage";
import {
  maintenanceTermLabel,
  type MaintenanceTerm,
} from "../features/workspace/maintenance-term";
type Snapshot = {
  handoverDate?: string;
  warranty: {
    revisionId?: string;
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
    revisionId?: string;
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
        term?: MaintenanceTerm;
        checklist: PolicyItem[];
      }[];
    };
    firstDueDates: { itemId: string; date: string; endDate?: string | null }[];
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
                {r.name} · mỗi {r.frequencyValue}{" "}
                {{ DAY: "ngày", WEEK: "tuần", MONTH: "tháng", YEAR: "năm" }[
                  r.frequencyUnit
                ] ?? r.frequencyUnit}
              </h4>
              <p>Thời hạn: {maintenanceTermLabel(r.term)}</p>
              {snapshot.maintenance.firstDueDates.find((d) => d.itemId === r.id)
                ?.endDate && (
                <p>
                  Ngày kết thúc:{" "}
                  {
                    snapshot.maintenance.firstDueDates.find(
                      (d) => d.itemId === r.id,
                    )?.endDate
                  }
                </p>
              )}
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
                    <strong>{i.title}</strong> ·{" "}
                    {serviceLabels[i.action] ?? i.action}
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
  onBusyChange,
  showCompleteButton = true,
  readOnly = false,
}: {
  id: string;
  version: number;
  status: string;
  snapshot?: Snapshot | null;
  changed: () => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  showCompleteButton?: boolean;
  readOnly?: boolean;
}) {
  const { profile } = useSession();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [months, setMonths] = useState(""),
    [reason, setReason] = useState("");
  const [scheduleOverrides, setScheduleOverrides] = useState<
    Record<
      string,
      { itemId: string; frequencyValue: number; firstOccurrence: number }
    >
  >({});
  const pending = useRef(false);
  const canManage = profile?.roles.includes("SERVICE_MANAGER");
  async function run(path?: string, body?: unknown) {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      if (path)
        await api.assetM2(`/equipment-registrations/${id}/${path}`, {
          method: "POST",
          body,
        });
      await changed();
      return true;
    } catch (e) {
      setError(modelSetupError(e));
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <section className="m1-card live-admin registration-model-policies">
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
          Hệ thống lấy chính sách đã công bố của Model và tự tính ngày bảo hành,
          lịch cùng hạng mục bảo trì theo ngày bàn giao.
        </p>
      )}
      {!canManage && status === "DRAFT" && (
        <p>
          Service Manager áp dụng chính sách và xác nhận bàn giao. Bạn có thể
          lưu hồ sơ để tiếp tục sau.
        </p>
      )}
      {!readOnly && status === "DRAFT" && (
        <button type="button" disabled={busy} onClick={() => void run()}>
          Tải lại kết quả đã lưu
        </button>
      )}
      {!readOnly && status === "DRAFT" && canManage && (
        <>
          <p>
            Chính sách được chọn sẽ áp dụng cho thiết bị khi xác nhận hoàn tất
            bàn giao.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (await run("model-policies", { expectedVersion: version })) {
                setMonths("");
                setReason("");
                setScheduleOverrides({});
              }
            }}
          >
            {busy
              ? "Đang lấy chính sách…"
              : snapshot
                ? "Lấy lại chính sách hiện hành từ Model"
                : "Áp dụng chính sách Model"}
          </button>
          {snapshot &&
            (snapshot.warranty.body.mode === "APPLY" ||
              snapshot.maintenance.body.mode === "APPLY") && (
              <details className="registration-policy-overrides">
                <summary>
                  Điều chỉnh ngoại lệ cho thiết bị này (tùy chọn)
                </summary>
                <p>
                  Giữ nguyên phiên bản đã chọn. Mọi thay đổi cần có lý do và
                  không sửa chính sách nguồn của Model.
                </p>
                <form
                  className="live-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!months && !Object.keys(scheduleOverrides).length) {
                      setError(
                        "Chọn thời hạn hoặc lịch cần điều chỉnh trước khi lưu ngoại lệ.",
                      );
                      return;
                    }
                    void run("model-policies", {
                      expectedVersion: version,
                      warrantyRevisionId: snapshot.warranty.revisionId,
                      maintenanceRevisionId: snapshot.maintenance.revisionId,
                      ...(snapshot.warranty.body.mode === "APPLY"
                        ? {
                            durationMonths: months
                              ? Number(months)
                              : snapshot.warranty.body.durationMonths,
                          }
                        : {}),
                      maintenanceOverrides: snapshot.maintenance.body.rules.map(
                        (rule) =>
                          scheduleOverrides[rule.id] ?? {
                            itemId: rule.id,
                            frequencyValue: rule.frequencyValue,
                            firstOccurrence: rule.firstOccurrence,
                          },
                      ),
                      reason,
                    });
                  }}
                >
                  <fieldset disabled={busy}>
                    {snapshot.warranty.body.mode === "APPLY" && (
                      <label>
                        Thời hạn bảo hành riêng (tháng)
                        <input
                          type="number"
                          min={1}
                          max={1200}
                          value={months}
                          placeholder={String(
                            snapshot.warranty.body.durationMonths,
                          )}
                          onChange={(e) => setMonths(e.target.value)}
                        />
                      </label>
                    )}
                    {snapshot.maintenance.body.rules.map((rule) => (
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
                                    scheduleOverrides[rule.id]
                                      ?.firstOccurrence ?? rule.firstOccurrence,
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
                                    scheduleOverrides[rule.id]
                                      ?.frequencyValue ?? rule.frequencyValue,
                                  firstOccurrence: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                      </div>
                    ))}
                    <label>
                      Lý do ngoại lệ
                      <textarea
                        required
                        maxLength={2000}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    <button disabled={busy}>
                      Tính lại chính sách với ngoại lệ
                    </button>
                  </fieldset>
                </form>
              </details>
            )}
          {snapshot && showCompleteButton && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run("submit", { expectedVersion: version })}
            >
              Xác nhận chính sách và hoàn tất bàn giao
            </button>
          )}
        </>
      )}
      {!readOnly && status === "PENDING_MAINTENANCE" && canManage && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("resume", {})}
        >
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
            {!data.value.canEdit ? (
              <div className="sd-checklist-readonly">
                <p>
                  Tiến độ:{" "}
                  {
                    data.value.items.filter((item) =>
                      ["DONE", "NOT_APPLICABLE"].includes(
                        results.find((row) => row.itemId === item.id)?.status ??
                          "",
                      ),
                    ).length
                  }
                  /{data.value.items.length} mục đã có kết quả. Xem ghi chú để
                  đối chiếu các mục không áp dụng.
                </p>
                <ol className="sd-history">
                  {data.value.items.map((item) => {
                    const result = results.find(
                      (row) => row.itemId === item.id,
                    );
                    return (
                      <li key={item.id}>
                        <strong>{item.title}</strong>
                        <span className="ws-badge ws-badge--blue">
                          {serviceLabels[result?.status ?? "NOT_DONE"]}
                        </span>
                        <p>
                          {serviceLabels[item.action] ?? item.action} ·{" "}
                          {item.required ? "Bắt buộc" : "Khuyến nghị"}
                        </p>
                        <p>{item.instructions}</p>
                        {result?.note && <p>Ghi chú: {result.note}</p>}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : (
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
                        {serviceLabels[item.action] ?? item.action} ·{" "}
                        {item.instructions}
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
                            results.find((r) => r.itemId === item.id)?.note ??
                            ""
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
            )}
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
                  <option key={c} value={c}>
                    {serviceLabels[c] ?? c}
                  </option>
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
      {typeof record.termMode === "string" && (
        <>
          <p>
            Thời hạn:{" "}
            {maintenanceTermLabel(
              record.termMode === "YEARS"
                ? { mode: "YEARS", years: Number(record.termYears) }
                : { mode: record.termMode as "UNLIMITED" | "WARRANTY_END" },
            )}
          </p>
          {Boolean(record.endDate) && (
            <p>Ngày kết thúc: {String(record.endDate)}</p>
          )}
          {record.hasNextOccurrence === false && (
            <p>
              Hiện không có kỳ bảo trì mới được lên lịch trong thời hạn. Các
              công việc đã tạo vẫn được giữ lại.
            </p>
          )}
        </>
      )}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.title}</strong> ·{" "}
            {serviceLabels[item.action] ?? item.action}
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
