import { serviceLabels } from "../features/workspace/service-detail-data";
import {
  ServiceCard,
  ServiceFacts,
  ServiceHeader,
  ServiceNotice,
  ServiceSections,
} from "../features/workspace/ServiceDetailUI";
import { useId, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useSession } from "../auth/session";
import { StatusBadge } from "../components/Badges";
import { useDirectory, errorText, type DirectoryRow } from "./registration-data";
import { LoadState } from "./registration-shared";
import "./live-administration.css";
import "./equipment-registration.css";
import "./model-policy.css";
import type { MaintenanceTerm } from "../features/workspace/maintenance-term";
export interface PolicyItem {
  id: string;
  title: string;
  action: string;
  instructions: string;
  required: boolean;
  allowNotApplicable: boolean;
}
interface Rule {
  id: string;
  name: string;
  frequencyUnit: string;
  frequencyValue: number;
  firstOccurrence: number;
  term?: MaintenanceTerm;
  checklist: PolicyItem[];
}
interface Body {
  mode: string;
  name: string;
  terms: string;
  reason: string;
  durationMonths?: number;
  coveredCauses?: string[];
  exclusions?: { code: string; text: string }[];
  rules?: Rule[];
}
interface Revision {
  id: string;
  revision: number;
  version: number;
  status: string;
  isDefault: boolean;
  body: Body;
}
const causes: Record<string, string> = {
  MANUFACTURING_DEFECT: "Lỗi sản xuất",
  ACCIDENTAL_DAMAGE: "Va đập/rơi vỡ",
  LIQUID_INGRESS: "Vào nước",
  MISUSE: "Sử dụng sai hướng dẫn",
  WEAR_AND_TEAR: "Hao mòn",
};
const initial = (maintenance: boolean): Body =>
  maintenance
    ? {
        mode: "APPLY",
        name: "Chương trình bảo trì",
        terms: "",
        reason: "",
        rules: [],
      }
    : {
        mode: "APPLY",
        name: "Bảo hành tiêu chuẩn",
        terms: "",
        reason: "",
        durationMonths: 12,
        coveredCauses: ["MANUFACTURING_DEFECT"],
        exclusions: [],
      };
const newItem = (): PolicyItem => ({
  id: crypto.randomUUID(),
  title: "",
  action: "INSPECT",
  instructions: "",
  required: true,
  allowNotApplicable: false,
});
export function ModelPolicyPage() {
  const location = useLocation();
  const origin = new URLSearchParams(location.search).get("registrationId") ??
    (location.state as { registrationId?: unknown } | null)?.registrationId;
  const registrationId =
    typeof origin === "string" &&
    /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(origin)
      ? origin
      : null;
  const { id } = useParams();
  const model = useDirectory<DirectoryRow>(
    "assetM2",
    id ? `/equipment-models/${id}` : null,
  );
  const details = model.value;
  const inactive = details?.status === "INACTIVE";
  return (
    <div className="ws-page model-policy-page model-page">
      <ServiceHeader
        back={registrationId ? `/app/equipment-registrations/${registrationId}` : "/app/equipment-models"}
        backLabel={registrationId ? "Quay lại hồ sơ bàn giao" : "Về danh sách model"}
        backState={registrationId ? { registrationStep: 2 } : undefined}
        title={details?.name ?? "Thông tin và chính sách model"}
      />
      <LoadState {...model} />
      {details && id && (
        <ServiceSections
          key={id}
          items={[
            {
              key: "information",
              label: "Thông tin",
              content: <ModelInformation model={details} />,
            },
            {
              key: "warranty",
              label: "Bảo hành",
              content: <PolicyEditor modelId={id} maintenance={false} inactive={inactive} />,
            },
            {
              key: "maintenance",
              label: "Bảo trì",
              content: <PolicyEditor modelId={id} maintenance inactive={inactive} />,
            },
          ]}
        />
      )}
    </div>
  );
}
function ModelInformation({ model }: { model: DirectoryRow }) {
  const active = model.status === "ACTIVE";
  return (
    <ServiceCard title="Thông tin model">
      <ServiceFacts
        items={[
          { label: "Tên dòng thiết bị", value: model.name },
          { label: "Mã model", value: model.modelCode || "—" },
          { label: "Hãng sản xuất", value: model.manufacturer || "—" },
          { label: "Số thiết bị", value: model.equipmentCount ?? "—" },
          {
            label: "Trạng thái",
            value: <StatusBadge status={active ? "ACTIVE" : "INACTIVE"} label={active ? "Đang dùng" : "Ngừng dùng"} />,
          },
          {
            label: "Mô tả",
            value: <span className="model-info-description">{model.description || "—"}</span>,
          },
        ]}
      />
    </ServiceCard>
  );
}
function PolicyEditor({
  modelId,
  maintenance,
  inactive,
}: {
  modelId: string;
  maintenance: boolean;
  inactive: boolean;
}) {
  const { profile } = useSession(),
    [revision, refresh] = useState(0),
    [picked, setPicked] = useState<Revision | null>(null),
    [body, setBody] = useState<Body>(() => initial(maintenance)),
    [revising, setRevising] = useState(false),
    [openDetails, setOpenDetails] = useState<Set<string>>(() => new Set()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const formId = useId();
  const sending = useRef(false);
  const area = maintenance ? "maintenance" : "assetM2",
    path = `/equipment-models/${modelId}/${maintenance ? "maintenance-profiles" : "warranty-policies"}`;
  const data = useDirectory<{ items: Revision[] }>(area, path, revision);
  const revisions = data.value?.items ?? (picked ? [picked] : []);
  const editable = !picked || picked.status === "DRAFT" || revising,
    current = picked?.status === "PUBLISHED" && picked.isDefault,
    hasManagePermission = maintenance
      ? profile?.roles.includes("SERVICE_MANAGER")
      : profile?.roles.some((r) =>
          ["TENANT_ADMIN", "SERVICE_MANAGER"].includes(r),
        );
  const canManage = hasManagePermission && !inactive;
  const service = maintenance ? "bảo trì" : "bảo hành";
  function change(patch: Partial<Body>) {
    setBody({ ...body, ...patch });
    setMessage("");
  }
  async function send(action: "SAVE" | "retire" | "reactivate") {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saving = action === "SAVE";
      const revisionPath = picked ? `${path}/${picked.id}` : path;
      const editPath = revising ? `${revisionPath}/revise` : revisionPath;
      const expectedVersion = picked?.version;
      const row = await api[area]<Revision>(saving ? editPath : `${revisionPath}/${action}`, {
        method: saving && picked && !revising ? "PUT" : "POST",
        body: saving
          ? { body, expectedVersion, ...(revising ? { publish: true } : { activate: true }) }
          : { expectedVersion },
      });
      setPicked(row);
      setBody(row.body);
      setRevising(false);
      refresh((v) => v + 1);
      if (action === "SAVE") setMessage("Đã lưu chính sách cho các lần bàn giao mới.");
    } catch (e) {
      setError(
        errorText(e) +
          " Kiểm tra lại danh sách trước khi gửi thêm một yêu cầu.",
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  function updateRule(index: number, patch: Partial<Rule>) {
    change({
      rules: body.rules?.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    });
  }
  function toggleDetails(key: string, open: boolean) {
    setOpenDetails((current) => {
      if (current.has(key) === open) return current;
      const next = new Set(current);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function addRule() {
    const item = newItem();
    const rule: Rule = {
      id: crypto.randomUUID(),
      name: "",
      frequencyUnit: "MONTH",
      frequencyValue: 3,
      firstOccurrence: 1,
      term: { mode: "UNLIMITED" },
      checklist: [item],
    };
    change({ rules: [...(body.rules ?? []), rule] });
    setOpenDetails(new Set([rule.id, `${rule.id}/${item.id}`]));
  }
  return (
    <ServiceCard
      title={maintenance ? "Chương trình bảo trì" : "Chính sách bảo hành"}
    >
      <LoadState {...data} />
      {error && (
        <p className="m1-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="live-success" role="status">
          {message}
        </p>
      )}
      <div className="model-policy-toolbar">
        <div className="live-toolbar model-policy-revisions">
          <label className="ws-label">
            Phiên bản
            <select
              value={picked?.id ?? ""}
              disabled={busy || revising}
              onChange={(e) => {
                const r =
                  data.value?.items.find((v) => v.id === e.target.value) ?? null;
                setPicked(r);
                setBody(r?.body ?? initial(maintenance));
                setOpenDetails(new Set());
                setError("");
                setMessage("");
              }}
            >
              <option value="">Tạo chính sách mới</option>
              {revisions.map((r) => (
                <option key={r.id} value={r.id}>
                  Phiên bản {r.revision}
                  {r.status === "PUBLISHED" && r.isDefault && " · Đang sử dụng"}
                  {r.status === "RETIRED" && " · Đã ngừng dùng"}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ws-button ws-button--secondary"
            onClick={() => refresh((v) => v + 1)}
          >
            Tải lại danh sách
          </button>
        </div>
        {canManage && (
          <div className="ws-actions">
            {current && !revising && (
              <button
                type="button"
                className="ws-button ws-button--secondary"
                disabled={busy}
                onClick={() => void send("retire")}
              >
                Ngừng áp dụng cho bàn giao mới
              </button>
            )}
            {picked && !editable && (
              <button
                type="button"
                className={current ? "ws-button" : "ws-button ws-button--secondary"}
                disabled={busy}
                onClick={() => {
                  setRevising(true);
                  setError("");
                  setMessage("");
                }}
              >
                Chỉnh sửa
              </button>
            )}
            {picked && !editable && !current && (
              <button
                type="button"
                className="ws-button"
                disabled={busy}
                onClick={() => void send("reactivate")}
              >
                Sử dụng lại
              </button>
            )}
            {revising && (
              <button
                type="button"
                className="ws-button ws-button--secondary"
                disabled={busy}
                onClick={() => {
                  setRevising(false);
                  if (picked) setBody(picked.body);
                  setError("");
                }}
              >
                Hủy chỉnh sửa
              </button>
            )}
            {editable && (
              <button
                type="submit"
                form={formId}
                className="ws-button"
                disabled={busy}
              >
                {busy ? "Đang lưu…" : "Lưu và sử dụng"}
              </button>
            )}
          </div>
        )}
      </div>
      {canManage && (editable || (picked && !current)) && (
        <p className="model-policy-hint model-policy-status">
          Chính sách đang sử dụng cùng loại sẽ được thay thế cho bàn giao mới.
          Thiết bị đã áp dụng chính sách giữ nguyên điều khoản.
        </p>
      )}
      {!data.loading && data.value && !data.value.items.length && (
        <ServiceNotice title="Chưa cấu hình chính sách">
          Cần lưu và sử dụng một chính sách trước khi hoàn tất bàn giao, kể cả khi model
          không kèm {service}.
        </ServiceNotice>
      )}
      {inactive && (
        <ServiceNotice title="Model đang ngừng dùng">
          Kích hoạt model trong danh mục để chỉnh sửa hoặc sử dụng chính sách.
        </ServiceNotice>
      )}
      {!inactive && !canManage && (
        <ServiceNotice title="Quyền xem cấu hình">
          Service Manager quản lý chương trình bảo trì.
        </ServiceNotice>
      )}
      <form
        id={formId}
        className="live-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (editable && canManage) void send("SAVE");
        }}
        onInvalidCapture={(e) => {
          if (!(e.target instanceof HTMLElement)) return;
          // Make required fields in collapsed schedules focusable by native validation.
          let section = e.target.closest("details");
          while (section && e.currentTarget.contains(section)) {
            section.open = true;
            section = section.parentElement?.closest("details") ?? null;
          }
        }}
      >
        <fieldset disabled={busy || !editable || !canManage}>
          <div className="model-policy-fields model-policy-basics">
            <label>
              Tên chính sách
              <input
                required
                maxLength={200}
                value={body.name}
                onChange={(e) => change({ name: e.target.value })}
              />
            </label>
            <label>
              {maintenance ? "Bảo trì khi bàn giao" : "Bảo hành khi bàn giao"}
              <select
                value={body.mode}
                onChange={(e) =>
                  change({
                    mode: e.target.value,
                    ...(maintenance && e.target.value === "NONE"
                      ? { rules: [] }
                      : {}),
                  })
                }
              >
                <option value="APPLY">
                  {maintenance ? "Có lịch bảo trì" : "Có bảo hành theo thời hạn"}
                </option>
                <option value="NONE">Không kèm {service}</option>
              </select>
            </label>
            {!maintenance && body.mode !== "NONE" && (
              <label>
                Thời hạn (tháng, từ ngày bàn giao)
                <input
                  required
                  type="number"
                  min={1}
                  max={1200}
                  value={body.durationMonths}
                  onChange={(e) =>
                    change({ durationMonths: Number(e.target.value) })
                  }
                />
              </label>
            )}
          </div>
          {body.mode === "NONE" ? (
            <label>
              Lý do không kèm {service}
              <textarea
                required
                maxLength={2000}
                value={body.reason}
                onChange={(e) => change({ reason: e.target.value })}
              />
            </label>
          ) : maintenance ? (
            <section className="model-policy-schedules">
              <div className="model-policy-section-heading">
                <h3>Lịch bảo trì ({body.rules?.length ?? 0})</h3>
                <button
                  type="button"
                  className="ws-button ws-button--secondary"
                  disabled={(body.rules?.length ?? 0) >= 8}
                  onClick={addRule}
                >
                  Thêm lịch bảo trì
                </button>
              </div>
              {body.rules?.map((rule, index) => (
                <details
                  className="sd-edit-disclosure model-policy-disclosure"
                  key={rule.id}
                  open={openDetails.has(rule.id)}
                  onToggle={(e) => {
                    if (e.target === e.currentTarget) {
                      toggleDetails(rule.id, e.currentTarget.open);
                    }
                  }}
                >
                  <summary>
                    <strong>{rule.name.trim() || `Lịch ${index + 1}`}</strong>
                    <small>
                      Mỗi {rule.frequencyValue}{" "}
                      {serviceLabels[rule.frequencyUnit] ?? rule.frequencyUnit}
                      {" · "}{rule.checklist.length} hạng mục
                    </small>
                  </summary>
                  <div className="model-policy-disclosure-body">
                    <label>
                      Tên công việc
                      <input
                        required
                        maxLength={200}
                        value={rule.name}
                        onChange={(e) =>
                          updateRule(index, { name: e.target.value })
                        }
                      />
                    </label>
                    <div className="model-policy-fields">
                      <label>
                        Mỗi
                        <input
                          required
                          type="number"
                          min={1}
                          max={1000}
                          value={rule.frequencyValue}
                          onChange={(e) =>
                            updateRule(index, {
                              frequencyValue: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Đơn vị
                        <select
                          value={rule.frequencyUnit}
                          onChange={(e) =>
                            updateRule(index, { frequencyUnit: e.target.value })
                          }
                        >
                          {["DAY", "WEEK", "MONTH", "YEAR"].map((u) => (
                            <option key={u}>{u}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Kỳ đầu sau bao nhiêu chu kỳ?
                        <input
                          type="number"
                          required
                          min={1}
                          max={100}
                          value={rule.firstOccurrence}
                          onChange={(e) =>
                            updateRule(index, {
                              firstOccurrence: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="model-policy-fields">
                      <label>
                        Thời hạn bảo trì
                        <select
                          aria-label="Thời hạn bảo trì"
                          value={rule.term?.mode ?? "UNLIMITED"}
                          onChange={(e) =>
                            updateRule(index, {
                              term:
                                e.target.value === "YEARS"
                                  ? { mode: "YEARS", years: 2 }
                                  : {
                                      mode: e.target.value as
                                        "UNLIMITED" | "WARRANTY_END",
                                    },
                            })
                          }
                        >
                          <option value="YEARS">Trong số năm xác định</option>
                          <option value="UNLIMITED">Vĩnh viễn</option>
                          <option value="WARRANTY_END">
                            Hết cùng với bảo hành
                          </option>
                        </select>
                      </label>
                      {rule.term?.mode === "YEARS" && (
                        <label>
                          Số năm bảo trì từ ngày bàn giao
                          <input
                            aria-label="Số năm bảo trì từ ngày bàn giao"
                            required
                            type="number"
                            min={1}
                            max={100}
                            step={1}
                            value={rule.term.years}
                            onChange={(e) =>
                              updateRule(index, {
                                term: {
                                  mode: "YEARS",
                                  years: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                      )}
                    </div>
                    <p className="model-policy-hint">
                      {rule.term?.mode === "YEARS"
                        ? "Bảo trì đến hết ngày kỷ niệm số năm đã chọn, kể cả kỳ đến hạn đúng ngày đó."
                        : rule.term?.mode === "WARRANTY_END"
                          ? "Ngày kết thúc lấy từ bảo hành áp dụng khi bàn giao, kể cả ngoại lệ riêng. Thiết bị phải có bảo hành."
                          : "Lịch tiếp tục lặp cho đến khi tạm dừng hoặc ngừng kế hoạch."}
                    </p>
                    <div className="model-policy-checklist">
                      <div className="model-policy-section-heading">
                        <h4>Checklist</h4>
                        <button
                          type="button"
                          className="ws-button ws-button--secondary"
                          disabled={rule.checklist.length >= 60}
                          onClick={() => {
                            const item = newItem();
                            updateRule(index, { checklist: [...rule.checklist, item] });
                            toggleDetails(`${rule.id}/${item.id}`, true);
                          }}
                        >
                          Thêm hạng mục
                        </button>
                      </div>
                      {rule.checklist.map((item, j) => (
                        <details
                          key={item.id}
                          className="sd-edit-disclosure model-policy-disclosure"
                          open={openDetails.has(`${rule.id}/${item.id}`)}
                          onToggle={(e) => {
                            if (e.target === e.currentTarget) {
                              toggleDetails(`${rule.id}/${item.id}`, e.currentTarget.open);
                            }
                          }}
                        >
                          <summary>
                            <strong>{item.title.trim() || `Hạng mục ${j + 1}`}</strong>
                            <small>{serviceLabels[item.action] ?? item.action}</small>
                          </summary>
                          <div className="model-policy-disclosure-body">
                            <div className="model-policy-fields">
                              <label>
                                Bộ phận / công việc
                                <input
                                  required
                                  maxLength={200}
                                  value={item.title}
                                  onChange={(e) =>
                                    updateRule(index, {
                                      checklist: rule.checklist.map((v, k) =>
                                        k === j ? { ...v, title: e.target.value } : v,
                                      ),
                                    })
                                  }
                                />
                              </label>
                              <label>
                                Hành động
                                <select
                                  value={item.action}
                                  onChange={(e) =>
                                    updateRule(index, {
                                      checklist: rule.checklist.map((v, k) =>
                                        k === j ? { ...v, action: e.target.value } : v,
                                      ),
                                    })
                                  }
                                >
                                  {[
                                    "INSPECT",
                                    "CLEAN",
                                    "LUBRICATE",
                                    "ADJUST",
                                    "REPLACE",
                                  ].map((a) => (
                                    <option key={a} value={a}>
                                      {serviceLabels[a] ?? a}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <label>
                              Hướng dẫn, điều kiện thay thế và vật tư dự kiến
                              <textarea
                                maxLength={2000}
                                value={item.instructions}
                                onChange={(e) =>
                                  updateRule(index, {
                                    checklist: rule.checklist.map((v, k) =>
                                      k === j
                                        ? { ...v, instructions: e.target.value }
                                        : v,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <div className="model-policy-checks">
                              <label className="live-check">
                                <input
                                  type="checkbox"
                                  checked={item.required}
                                  onChange={(e) =>
                                    updateRule(index, {
                                      checklist: rule.checklist.map((v, k) =>
                                        k === j
                                          ? { ...v, required: e.target.checked }
                                          : v,
                                      ),
                                    })
                                  }
                                />
                                Bắt buộc
                              </label>
                              <label className="live-check">
                                <input
                                  type="checkbox"
                                  checked={item.allowNotApplicable}
                                  onChange={(e) =>
                                    updateRule(index, {
                                      checklist: rule.checklist.map((v, k) =>
                                        k === j
                                          ? {
                                              ...v,
                                              allowNotApplicable: e.target.checked,
                                            }
                                          : v,
                                      ),
                                    })
                                  }
                                />
                                Cho phép không áp dụng khi có lý do
                              </label>
                            </div>
                            <div className="ws-actions">
                              <button
                                type="button"
                                className="ws-button ws-button--secondary"
                                disabled={j === 0}
                                onClick={() => {
                                  const items = [...rule.checklist];
                                  [items[j - 1], items[j]] = [items[j], items[j - 1]];
                                  updateRule(index, { checklist: items });
                                }}
                              >
                                Đưa lên
                              </button>
                              <button
                                type="button"
                                className="ws-button ws-button--secondary"
                                onClick={() =>
                                  updateRule(index, {
                                    checklist: rule.checklist.filter(
                                      (_, k) => k !== j,
                                    ),
                                  })
                                }
                              >
                                Xóa hạng mục
                              </button>
                            </div>
                          </div>
                        </details>
                    ))}
                    </div>
                    <div className="ws-actions">
                      <button
                        type="button"
                        className="ws-button ws-button--secondary"
                        onClick={() =>
                          change({
                            rules: body.rules?.filter((_, i) => i !== index),
                          })
                        }
                      >
                        Xóa lịch
                      </button>
                    </div>
                  </div>
                </details>
              ))}
              <p className="model-policy-hint">
                Các lịch độc lập có thể cùng đến hạn. Tránh khai báo lặp công
                việc; vật tư dự kiến không tự xuất kho.
              </p>
            </section>
          ) : (
            <div className="model-policy-warranty">
              <fieldset className="model-policy-group">
                <legend>Nguyên nhân được bảo hành</legend>
                <div className="model-policy-checks">
                  {Object.entries(causes).map(([code, label]) => (
                    <label className="live-check" key={code}>
                      <input
                        type="checkbox"
                        checked={body.coveredCauses?.includes(code) ?? false}
                        onChange={(e) =>
                          change({
                            coveredCauses: e.target.checked
                              ? [...(body.coveredCauses ?? []), code]
                              : body.coveredCauses?.filter((c) => c !== code),
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="model-policy-group">
                <legend>Điều khoản loại trừ</legend>
                {body.exclusions?.map((ex, index) => (
                  <div className="model-policy-exclusion" key={index}>
                    <select
                      aria-label={`Nguyên nhân loại trừ ${index + 1}`}
                      value={ex.code}
                      onChange={(e) =>
                        change({
                          exclusions: body.exclusions?.map((v, i) =>
                            i === index ? { ...v, code: e.target.value } : v,
                          ),
                        })
                      }
                    >
                      {Object.entries(causes).map(([c, l]) => (
                        <option key={c} value={c}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <textarea
                      required
                      aria-label={`Điều khoản loại trừ ${index + 1}`}
                      maxLength={2000}
                      value={ex.text}
                      onChange={(e) =>
                        change({
                          exclusions: body.exclusions?.map((v, i) =>
                            i === index ? { ...v, text: e.target.value } : v,
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      className="ws-button ws-button--secondary"
                      onClick={() =>
                        change({
                          exclusions: body.exclusions?.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    >
                      Xóa điều khoản
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="ws-button ws-button--secondary"
                  onClick={() =>
                    change({
                      exclusions: [
                        ...(body.exclusions ?? []),
                        { code: "LIQUID_INGRESS", text: "" },
                      ],
                    })
                  }
                >
                  Thêm loại trừ
                </button>
              </fieldset>
            </div>
          )}
          <label>
            Điều khoản cho khách hàng
            <textarea
              maxLength={10000}
              value={body.terms}
              onChange={(e) => change({ terms: e.target.value })}
            />
          </label>
        </fieldset>
      </form>
    </ServiceCard>
  );
}
