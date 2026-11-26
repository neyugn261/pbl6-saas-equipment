import { serviceLabels } from "../features/workspace/service-detail-data";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "../api/client";
import { useSession } from "../auth/session";
import { useDirectory, errorText, modelSetupError } from "./registration-data";
import { LoadState } from "./registration-shared";
import { ServiceCard, ServiceFacts, ServiceNotice } from "../features/workspace/ServiceDetailUI";
import { formatDate } from "../features/workspace/workspace-data";
import type { PolicyItem } from "./ModelPolicyPage";
import {
  maintenanceTermLabel,
  type MaintenanceTerm,
} from "../features/workspace/maintenance-term";
import "./policy-summary.css";
export type ModelPolicySnapshot = {
  modelId?: string;
  handoverDate?: string;
  overrideReason?: string;
  warranty: {
    revisionId?: string | null;
    revision: number | null;
    body: {
      mode: string;
      name: string;
      terms: string;
      reason: string;
      durationMonths: number;
      coveredCauses: string[];
      exclusions: { code: string; text: string }[];
    };
    startDate: string | null;
    endDate: string | null;
  };
  maintenance: {
    revisionId?: string | null;
    revision: number | null;
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
const frequencyUnits: Record<string, string> = { DAY: "ngày", WEEK: "tuần", MONTH: "tháng", YEAR: "năm" };
type Snapshot = ModelPolicySnapshot;
type Warranty = Snapshot["warranty"];
type Maintenance = Snapshot["maintenance"];
type PolicyRevision<T> = {
  id: string;
  revision: number;
  status: string;
  isDefault: boolean;
  body: T;
};
type ScheduleOverride = { itemId: string; frequencyValue: number; firstOccurrence: number };

function WarrantyDetails({ policy }: { policy: Pick<Warranty, "body"> & Partial<Warranty> }) {
  const { body, startDate, endDate } = policy;
  return (
    <>
      <h4>{body.name}</h4>
      {body.mode === "NONE" ? <p className="model-policy-terms">{body.reason}</p> : (
        <ServiceFacts items={[
          { label: "Thời hạn", value: `${body.durationMonths} tháng` },
          ...(startDate && endDate ? [
            { label: "Từ ngày", value: formatDate(startDate) },
            { label: "Đến ngày", value: formatDate(endDate) },
          ] : []),
        ]} />
      )}
      {body.coveredCauses?.length > 0 && (
        <section className="model-policy-detail">
          <h4>Nguyên nhân được bảo hành</h4>
          <p>{body.coveredCauses.map((code) => serviceLabels[code] ?? code).join(", ")}</p>
        </section>
      )}
      {body.exclusions.length > 0 && (
        <section className="model-policy-detail">
          <h4>Điều khoản loại trừ</h4>
          <ul className="model-policy-list">
            {body.exclusions.map((row) => <li key={row.code}>{row.text}</li>)}
          </ul>
        </section>
      )}
      {body.terms && <p className="model-policy-terms">{body.terms}</p>}
    </>
  );
}

function MaintenanceDetails({ policy }: { policy: Pick<Maintenance, "body"> & Partial<Maintenance> }) {
  const { body, firstDueDates } = policy;
  return (
    <>
      <h4>{body.name}</h4>
      {body.mode === "NONE" ? <p className="model-policy-terms">{body.reason}</p> : (
        body.rules.map((rule) => {
          const dates = firstDueDates?.find((entry) => entry.itemId === rule.id);
          return (
            <section className="model-policy-rule" key={rule.id}>
              <h4>{rule.name}</h4>
              <ServiceFacts items={[
                { label: "Chu kỳ", value: `Mỗi ${rule.frequencyValue} ${frequencyUnits[rule.frequencyUnit] ?? rule.frequencyUnit}` },
                { label: "Kỳ đầu", value: firstDueDates ? formatDate(dates?.date) : `Sau ${rule.firstOccurrence} chu kỳ` },
                { label: "Thời hạn", value: maintenanceTermLabel(rule.term) },
                ...(dates?.endDate ? [{ label: "Ngày kết thúc", value: formatDate(dates.endDate) }] : []),
              ]} />
              {rule.checklist.length > 0 && (
                <ul className="model-policy-list">
                  {rule.checklist.map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}</strong> · {serviceLabels[item.action] ?? item.action}
                      {item.instructions && <p>{item.instructions}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
      {body.terms && <p className="model-policy-terms">{body.terms}</p>}
    </>
  );
}

export function ModelPolicySummary({
  snapshot, includeOverrideReason = false,
}: {
  snapshot: Snapshot;
  includeOverrideReason?: boolean;
}) {
  return (
    <div className="model-policy-summary">
      <ServiceCard title="Bảo hành" headingLevel="h3" actions={snapshot.warranty.revision !== null
        ? <span className="ws-pill">Phiên bản {snapshot.warranty.revision}</span>
        : undefined}>
        <WarrantyDetails policy={snapshot.warranty} />
      </ServiceCard>
      <ServiceCard title="Bảo trì" headingLevel="h3" actions={snapshot.maintenance.revision !== null
        ? <span className="ws-pill">Phiên bản {snapshot.maintenance.revision}</span>
        : undefined}>
        <MaintenanceDetails policy={snapshot.maintenance} />
      </ServiceCard>
      {includeOverrideReason && snapshot.overrideReason && (
        <p className="model-policy-terms model-policy-wide">
          <strong>Lý do ngoại lệ:</strong> {snapshot.overrideReason}
        </p>
      )}
    </div>
  );
}

function PolicyVersionSelect<T extends { name: string }>({
  label, revisions, value, onChange, noneLabel,
}: {
  label: string;
  revisions: PolicyRevision<T>[];
  value: string;
  onChange: (value: string) => void;
  noneLabel?: string;
}) {
  return (
    <label className="ws-label">
      {label}
      <select disabled={!noneLabel && revisions.length === 0} required={!noneLabel} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{noneLabel ?? "Chọn phiên bản"}</option>
        {revisions.map((row) => (
          <option key={row.id} value={row.id}>
            {`Phiên bản ${row.revision} · ${row.body.name}${row.isDefault ? " (Đang sử dụng)" : ""}`}
          </option>
        ))}
      </select>
    </label>
  );
}

export function HandoverPolicyPanel({
  id, modelId, modelName, modelCode, version, status, snapshot, changed, onBusyChange,
}: {
  id: string;
  modelId: string;
  modelName?: string;
  modelCode?: string;
  version: number;
  status: string;
  snapshot?: Snapshot | null;
  changed: () => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { profile } = useSession();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const pending = useRef(false);
  const [view, setView] = useState<"versions" | "overrides" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warrantyId, setWarrantyId] = useState<string | null>(null);
  const [maintenanceId, setMaintenanceId] = useState<string | null>(null);
  const [months, setMonths] = useState("");
  const [reason, setReason] = useState("");
  const [scheduleOverrides, setScheduleOverrides] = useState<Record<string, ScheduleOverride>>({});
  const canManage = status === "DRAFT" && profile?.roles.includes("SERVICE_MANAGER");
  const path = view === "versions" && canManage ? `/equipment-models/${modelId}` : null;
  const warranties = useDirectory<{ items: PolicyRevision<Warranty["body"]>[] }>(
    "assetM2", path && `${path}/warranty-policies`,
  );
  const profiles = useDirectory<{ items: PolicyRevision<Maintenance["body"]>[] }>(
    "maintenance", path && `${path}/maintenance-profiles`,
  );
  const warrantyRevisions = warranties.value?.items.filter((row) => row.status === "PUBLISHED") ?? [];
  const maintenanceRevisions = profiles.value?.items.filter((row) => row.status === "PUBLISHED") ?? [];
  const currentWarrantyId = snapshot?.warranty.revisionId;
  const warranty = warrantyId === null && currentWarrantyId !== null
    ? warrantyRevisions.find((row) => row.id === currentWarrantyId)
      ?? warrantyRevisions.find((row) => row.isDefault)
    : warrantyRevisions.find((row) => row.id === warrantyId);
  const selectedWarrantyId = warranty?.id ?? null;
  const currentMaintenanceId = snapshot?.maintenance.revisionId;
  const maintenance = maintenanceId === null && currentMaintenanceId !== null
    ? maintenanceRevisions.find((row) => row.id === currentMaintenanceId)
      ?? maintenanceRevisions.find((row) => row.isDefault)
    : maintenanceRevisions.find((row) => row.id === maintenanceId);
  const selectedMaintenanceId = maintenance?.id ?? null;
  const keepVersions = Boolean(snapshot &&
    selectedWarrantyId === currentWarrantyId && selectedMaintenanceId === currentMaintenanceId);
  const loadingVersions = warranties.loading || profiles.loading;

  useEffect(() => {
    const element = dialog.current;
    if (view && element && !element.open) element.showModal();
  }, [view]);

  function open(next: "versions" | "overrides") {
    setError("");
    setWarrantyId(null);
    setMaintenanceId(null);
    setMonths(String(snapshot?.warranty.body.durationMonths ?? ""));
    setReason(snapshot?.overrideReason ?? "");
    setScheduleOverrides({});
    setView(next);
  }

  function close() {
    dialog.current?.close();
    setView(null);
  }

  async function apply(body?: Record<string, unknown>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      if (body)
        await api.assetM2(`/equipment-registrations/${id}/model-policies`, {
          method: "POST",
          body: { expectedVersion: version, ...body },
        });
      await changed();
      close();
    } catch (e) {
      setError(modelSetupError(e));
    } finally {
      pending.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  const overrideWarranty = snapshot?.warranty.body.mode === "APPLY";
  const rules = snapshot?.maintenance.body.rules ?? [];
  const overrideChanged =
    (overrideWarranty && Number(months) !== snapshot.warranty.body.durationMonths) ||
    rules.some((rule) => {
      const change = scheduleOverrides[rule.id];
      return change && (change.frequencyValue !== rule.frequencyValue || change.firstOccurrence !== rule.firstOccurrence);
    });
  return (
    <section className="registration-model-policies">
      <header className="registration-policy-header">
        <div>
          <h2>Chính sách Model</h2>
          {modelName && <p className="registration-policy-model">
            <strong>{modelName}</strong>
            {modelCode && modelCode !== modelName && <span className="ws-pill">{modelCode}</span>}
          </p>}
        </div>
        {canManage && (
          <div className="ws-actions">
            {snapshot && (overrideWarranty || rules.length > 0) && (
              <button type="button" className="ws-button ws-button--secondary" disabled={busy} onClick={() => open("overrides")}>
                Điều chỉnh ngoại lệ
              </button>
            )}
            <button type="button" className="ws-button" disabled={busy} onClick={() => open("versions")}>
              Chọn phiên bản chính sách Model
            </button>
          </div>
        )}
      </header>
      {snapshot ? <ModelPolicySummary snapshot={snapshot} includeOverrideReason /> : (
        <ServiceNotice title="Chưa áp dụng chính sách cho hồ sơ này.">
          {canManage
            ? "Chọn phiên bản cho từng dịch vụ nếu hồ sơ có áp dụng."
            : "Service Manager áp dụng chính sách và xác nhận bàn giao."}
        </ServiceNotice>
      )}
      {canManage && (
        <dialog
          ref={dialog}
          className="registration-policy-dialog"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          onCancel={(event) => {
            if (pending.current) event.preventDefault();
            else setView(null);
          }}
        >
          {view && (
            <form className="registration-policy-dialog-form" onSubmit={(event) => {
              event.preventDefault();
              if (view === "versions" && !loadingVersions) {
                if (keepVersions) close();
                else void apply({ warrantyRevisionId: selectedWarrantyId, maintenanceRevisionId: selectedMaintenanceId });
              }
              if (view === "overrides" && snapshot && overrideChanged && reason.trim())
                void apply({
                  warrantyRevisionId: snapshot.warranty.revisionId,
                  maintenanceRevisionId: snapshot.maintenance.revisionId,
                  ...(overrideWarranty ? { durationMonths: Number(months) } : {}),
                  maintenanceOverrides: rules.map((rule) => scheduleOverrides[rule.id] ?? {
                    itemId: rule.id, frequencyValue: rule.frequencyValue, firstOccurrence: rule.firstOccurrence,
                  }),
                  reason: reason.trim(),
                });
            }}>
              <header className="registration-policy-dialog-header">
                <h2 id={titleId}>{view === "versions" ? "Chọn phiên bản chính sách Model" : "Điều chỉnh ngoại lệ"}</h2>
                <p id={descriptionId}>{view === "versions"
                  ? "Bạn có thể áp dụng từng dịch vụ hoặc chọn không áp dụng cả hai."
                  : "Các điều chỉnh áp dụng riêng cho thiết bị trong hồ sơ này."}</p>
              </header>
              <div className="registration-policy-dialog-body">
                <fieldset disabled={busy}>
                  {view === "versions" ? (
                    <>
                      <div className="model-policy-summary">
                        <ServiceCard title="Bảo hành" headingLevel="h3">
                          <PolicyVersionSelect
                            label="Phiên bản bảo hành"
                            revisions={warrantyRevisions}
                            value={selectedWarrantyId ?? ""}
                            onChange={setWarrantyId}
                            noneLabel="Không áp dụng bảo hành"
                          />
                          <LoadState {...warranties} />
                          {warranty && <div className="registration-policy-preview"><WarrantyDetails policy={warranty} /></div>}
                          {!warranty && !warranties.loading && <p className="registration-policy-message">Hồ sơ này sẽ không tạo bảo hành.</p>}
                        </ServiceCard>
                        <ServiceCard title="Bảo trì" headingLevel="h3">
                          <PolicyVersionSelect
                            label="Phiên bản bảo trì"
                            revisions={maintenanceRevisions}
                            value={selectedMaintenanceId ?? ""}
                            onChange={setMaintenanceId}
                            noneLabel="Không áp dụng bảo trì"
                          />
                          <LoadState {...profiles} />
                          {maintenance && <div className="registration-policy-preview"><MaintenanceDetails policy={maintenance} /></div>}
                          {!maintenance && !profiles.loading && <p className="registration-policy-message">Hồ sơ này sẽ không tạo lịch bảo trì định kỳ.</p>}
                        </ServiceCard>
                      </div>
                      {snapshot?.overrideReason && !keepVersions && !loadingVersions && (
                        <ServiceNotice title="Đặt lại ngoại lệ">
                          Chọn phiên bản khác sẽ đặt lại các ngoại lệ của hồ sơ.
                        </ServiceNotice>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="model-policy-summary">
                        <ServiceCard title="Bảo hành" headingLevel="h3">
                          {overrideWarranty ? (
                            <label className="ws-label">
                              Thời hạn bảo hành (tháng)
                              <input type="number" min={1} max={1200} required value={months}
                                onChange={(event) => setMonths(event.target.value)} />
                            </label>
                          ) : <p className="registration-policy-message">Phiên bản này không kèm bảo hành.</p>}
                        </ServiceCard>
                        <ServiceCard title="Bảo trì" headingLevel="h3">
                          {rules.length ? rules.map((rule) => {
                            const schedule = scheduleOverrides[rule.id] ?? rule;
                            return (
                              <section className="model-policy-rule" key={rule.id}>
                                <h4>{rule.name}</h4>
                                <div className="ws-form-grid">
                                  <label className="ws-label">
                                    Chu kỳ ({frequencyUnits[rule.frequencyUnit] ?? rule.frequencyUnit})
                                    <input type="number" min={1} max={1000} required value={schedule.frequencyValue || ""}
                                      onChange={(event) => setScheduleOverrides((prev) => ({
                                        ...prev, [rule.id]: { itemId: rule.id, firstOccurrence: schedule.firstOccurrence, frequencyValue: Number(event.target.value) },
                                      }))} />
                                  </label>
                                  <label className="ws-label">
                                    Kỳ đầu (số chu kỳ)
                                    <input type="number" min={1} max={100} required value={schedule.firstOccurrence || ""}
                                      onChange={(event) => setScheduleOverrides((prev) => ({
                                        ...prev, [rule.id]: { itemId: rule.id, frequencyValue: schedule.frequencyValue, firstOccurrence: Number(event.target.value) },
                                      }))} />
                                  </label>
                                </div>
                              </section>
                            );
                          }) : <p className="registration-policy-message">Phiên bản này không có lịch bảo trì.</p>}
                        </ServiceCard>
                      </div>
                      <label className="ws-label">
                        Lý do ngoại lệ
                        <textarea required maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} />
                      </label>
                    </>
                  )}
                </fieldset>
              </div>
              <footer className="registration-policy-dialog-footer">
                {error && <p role="alert" className="m1-error">{error}</p>}
                <div className="ws-actions">
                  {error && <button type="button" className="ws-button ws-button--secondary" disabled={busy}
                    onClick={() => void apply()}>Tải lại kết quả đã lưu</button>}
                  <button type="button" className="ws-button ws-button--secondary" disabled={busy} onClick={close}>Hủy</button>
                  <button type="submit" className="ws-button" disabled={busy || (view === "versions" ? loadingVersions : !overrideChanged || !reason.trim())}>
                    {busy ? "Đang áp dụng…" : "Áp dụng"}
                  </button>
                </div>
              </footer>
            </form>
          )}
        </dialog>
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
    <ServiceCard title="Chính sách dịch vụ đã áp dụng" description="Điều khoản bảo hành và bảo trì được ghi nhận cho thiết bị.">
      <div className="equipment-applied-policy">
      <LoadState {...data} />
      {data.value?.state === "AWAITING_CUSTOMER" && <ServiceNotice title="Đang chờ khách hàng xác nhận"><p role="status">Các điều khoản dưới đây là nội dung đã gửi; bảo hành và lịch bảo trì chưa được áp dụng.</p></ServiceNotice>}
      {data.value?.state === "SETUP_PENDING" && (
        <ServiceNotice title="Đang hoàn tất thiết lập dịch vụ">
        <p role="status">
          Hệ thống đang hoàn tất thiết lập lịch bảo trì. Điều khoản dưới đây đã được xác nhận.
        </p>
        </ServiceNotice>
      )}
      {data.value?.snapshot ? (
        <ModelPolicySummary snapshot={data.value.snapshot} />
      ) : (
        data.value && (
          <>
            <ServiceNotice title="Chính sách riêng của thiết bị">
            <p>
              Hồ sơ hiện có được ghi nhận theo chính sách riêng; chưa áp dụng
              phiên bản Model.
            </p>
            </ServiceNotice>
            {data.value.warranties.length ? <ul className="equipment-policy-records">
              {data.value.warranties.map(w => (
                <li key={w.id}>
                  <h3>Điều khoản bảo hành</h3>
                  <ServiceFacts items={[
                    { label: "Hiệu lực từ", value: formatDate(w.startDate) },
                    { label: "Đến ngày", value: formatDate(w.endDate) },
                  ]} />
                  <section className="equipment-policy-terms">
                    <h4>Nội dung áp dụng</h4>
                    <p>{w.terms || "Chưa ghi nhận nội dung điều khoản."}</p>
                  </section>
                </li>
              ))}
            </ul> : <p className="equipment-source-message">Chưa có chi tiết bảo hành được ghi nhận tại đây.</p>}
          </>
        )
      )}
      </div>
    </ServiceCard>
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
    <ServiceCard title="Phạm vi bảo hành của sự cố">
      <div className="live-admin request-warranty-assessment">
        <p>
          {request.coverageAssessment
            ? `${request.coverageAssessment.decision === "COVERED" ? "Được bảo hành" : "Không thuộc phạm vi bảo hành"} · ${request.coverageAssessment.reason}`
            : request.assessmentRequired
              ? "Chưa kết luận. Còn thời hạn không đồng nghĩa sự cố được bảo hành."
              : "Hồ sơ bảo hành được ghi nhận theo luồng hiện hành."}
        </p>
        {request.appliedWarrantyPolicy && (
          <>
            <p className="request-policy-terms">{request.appliedWarrantyPolicy.terms}</p>
            <ul className="model-policy-list">
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
            <fieldset className="request-assessment-fields" disabled={busy}>
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
              <label className="request-assessment-reason">
                Lý do / bằng chứng đã kiểm tra
                <textarea
                  required
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button type="submit" className="ws-button">Lưu kết luận</button>
            </fieldset>
          </form>
        )}
      </div>
    </ServiceCard>
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
