import { serviceLabels } from "../features/workspace/service-detail-data";
import { ServiceSections } from "../features/workspace/ServiceDetailUI";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useSession } from "../auth/session";
import { useDirectory, errorText } from "./registration-data";
import { LoadState } from "./registration-shared";
import "./live-administration.css";
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
  const origin = (location.state as { registrationId?: unknown } | null)
    ?.registrationId;
  const registrationId =
    typeof origin === "string" &&
    /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(origin)
      ? origin
      : null;
  const { id } = useParams(),
    model = useDirectory<{
      name: string;
      manufacturer: string;
      modelCode: string;
    }>("assetM2", id ? `/equipment-models/${id}` : null);
  return (
    <div className="live-admin">
      <header className="m1-header">
        <div>
          <h1>{model.value?.name ?? "Chính sách Model"}</h1>
          <p>
            Thiết lập một lần để áp dụng khi bàn giao. Máy đã bàn giao giữ
            nguyên phiên bản đã nhận.
          </p>
        </div>
        <div className="live-toolbar">
          {registrationId && (
            <Link
              to={`/app/equipment-registrations/${registrationId}`}
              state={{ registrationStep: 2 }}
            >
              ← Quay lại hồ sơ bàn giao
            </Link>
          )}
          <Link to="/app/equipment-models">Danh sách Model</Link>
        </div>
      </header>
      <LoadState {...model} />
      {model.value && id && (
        <>
          <ServiceSections
            items={[
              {
                key: "warranty",
                label: "Chính sách bảo hành",
                content: (
                  <PolicyEditor
                    key={id + "w"}
                    modelId={id}
                    maintenance={false}
                  />
                ),
              },
              {
                key: "maintenance",
                label: "Chính sách bảo trì & checklist",
                content: (
                  <PolicyEditor key={id + "m"} modelId={id} maintenance />
                ),
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
function PolicyEditor({
  modelId,
  maintenance,
}: {
  modelId: string;
  maintenance: boolean;
}) {
  const { profile } = useSession(),
    [revision, refresh] = useState(0),
    [picked, setPicked] = useState<Revision | null>(null),
    [body, setBody] = useState<Body>(() => initial(maintenance)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const area = maintenance ? "maintenance" : "assetM2",
    path = `/equipment-models/${modelId}/${maintenance ? "maintenance-profiles" : "warranty-policies"}`;
  const data = useDirectory<{ items: Revision[] }>(area, path, revision);
  const editable = !picked || picked.status === "DRAFT",
    canManage = maintenance
      ? profile?.roles.includes("SERVICE_MANAGER")
      : profile?.roles.some((r) =>
          ["TENANT_ADMIN", "SERVICE_MANAGER"].includes(r),
        );
  function change(patch: Partial<Body>) {
    setBody({ ...body, ...patch });
    setMessage("");
  }
  async function send(action: "SAVE" | "publish" | "retire") {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const row = await api[area]<Revision>(
        path +
          (picked ? `/${picked.id}` : "") +
          (action === "SAVE" ? "" : `/${action}`),
        {
          method: action === "SAVE" ? (picked ? "PUT" : "POST") : "POST",
          body:
            action === "SAVE"
              ? { body, ...(picked ? { expectedVersion: picked.version } : {}) }
              : { expectedVersion: picked!.version },
        },
      );
      setPicked(row);
      setBody(row.body);
      refresh((v) => v + 1);
      setMessage(
        action === "SAVE"
          ? "Đã lưu bản nháp."
          : action === "publish"
            ? "Đã công bố và dùng làm mặc định cho bàn giao mới."
            : "Đã ngừng áp dụng cho bàn giao mới.",
      );
    } catch (e) {
      setError(
        errorText(e) +
          " Kiểm tra lại danh sách trước khi gửi thêm một yêu cầu.",
      );
    } finally {
      setBusy(false);
    }
  }
  function updateRule(index: number, patch: Partial<Rule>) {
    change({
      rules: body.rules?.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    });
  }
  return (
    <section className="m1-card">
      <h2>{maintenance ? "Chương trình bảo trì" : "Chính sách bảo hành"}</h2>
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
      <div className="live-toolbar">
        <label>
          Phiên bản{" "}
          <select
            value={picked?.id ?? ""}
            disabled={busy}
            onChange={(e) => {
              const r =
                data.value?.items.find((v) => v.id === e.target.value) ?? null;
              setPicked(r);
              setBody(r?.body ?? initial(maintenance));
              setMessage("");
            }}
          >
            <option value="">Tạo bản nháp mới</option>
            {data.value?.items.map((r) => (
              <option key={r.id} value={r.id}>
                Phiên bản {r.revision} · {serviceLabels[r.status] ?? r.status}
                {r.isDefault ? " · Mặc định" : ""}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => refresh((v) => v + 1)}>Tải lại danh sách</button>
        {picked && (
          <button
            disabled={busy || !canManage}
            onClick={() => {
              setPicked(null);
              setBody(structuredClone(picked.body));
              setMessage("");
            }}
          >
            Sao chép thành bản mới
          </button>
        )}
      </div>
      {!data.loading && data.value && !data.value.items.length && (
        <p>
          Chưa cấu hình chính sách. Cần công bố hoặc xác nhận không áp dụng
          trước khi hoàn tất bàn giao.
        </p>
      )}
      {!canManage && (
        <p>
          Bạn có thể xem cấu hình; Service Manager quản lý chương trình bảo trì.
        </p>
      )}
      <form
        className="live-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void send("SAVE");
        }}
      >
        <fieldset disabled={busy || !editable || !canManage}>
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
            Áp dụng
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
              <option value="APPLY">Có áp dụng</option>
              <option value="NONE">Không áp dụng (có lý do)</option>
            </select>
          </label>
          {body.mode === "NONE" ? (
            <label>
              Lý do không áp dụng
              <textarea
                required
                maxLength={2000}
                value={body.reason}
                onChange={(e) => change({ reason: e.target.value })}
              />
            </label>
          ) : maintenance ? (
            <>
              {body.rules?.map((rule, index) => (
                <section className="m1-card" key={rule.id}>
                  <h3>Lịch {index + 1}</h3>
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
                  <div className="live-toolbar">
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
                  <div className="live-toolbar">
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
                  <p>
                    {rule.term?.mode === "YEARS"
                      ? "Bảo trì đến hết ngày kỷ niệm số năm đã chọn, kể cả kỳ đến hạn đúng ngày đó."
                      : rule.term?.mode === "WARRANTY_END"
                        ? "Ngày kết thúc lấy từ bảo hành áp dụng khi bàn giao, kể cả ngoại lệ riêng. Thiết bị phải có bảo hành."
                        : "Lịch tiếp tục lặp cho đến khi tạm dừng hoặc ngừng kế hoạch."}
                  </p>
                  {rule.checklist.map((item, j) => (
                    <fieldset key={item.id} className="m1-card">
                      <legend>Hạng mục {j + 1}</legend>
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
                          value={serviceLabels[item.action] ?? item.action}
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
                      <div className="live-toolbar">
                        <button
                          type="button"
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
                    </fieldset>
                  ))}
                  <div className="live-toolbar">
                    <button
                      type="button"
                      disabled={rule.checklist.length >= 60}
                      onClick={() =>
                        updateRule(index, {
                          checklist: [...rule.checklist, newItem()],
                        })
                      }
                    >
                      Thêm hạng mục
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        change({
                          rules: body.rules?.filter((_, i) => i !== index),
                        })
                      }
                    >
                      Xóa lịch
                    </button>
                  </div>
                </section>
              ))}
              <button
                type="button"
                disabled={(body.rules?.length ?? 0) >= 8}
                onClick={() =>
                  change({
                    rules: [
                      ...(body.rules ?? []),
                      {
                        id: crypto.randomUUID(),
                        name: "",
                        frequencyUnit: "MONTH",
                        frequencyValue: 3,
                        firstOccurrence: 1,
                        term: { mode: "UNLIMITED" },
                        checklist: [newItem()],
                      },
                    ],
                  })
                }
              >
                Thêm lịch bảo trì
              </button>
              <p>
                Các lịch độc lập có thể cùng đến hạn. Tránh khai báo lặp công
                việc; vật tư dự kiến không tự xuất kho.
              </p>
            </>
          ) : (
            <>
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
              <fieldset>
                <legend>Nguyên nhân được bảo hành</legend>
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
              </fieldset>
              <fieldset>
                <legend>Điều khoản loại trừ</legend>
                {body.exclusions?.map((ex, index) => (
                  <div key={index}>
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
            </>
          )}
          <label>
            Điều khoản cho khách hàng
            <textarea
              maxLength={10000}
              value={body.terms}
              onChange={(e) => change({ terms: e.target.value })}
            />
          </label>
          <button>{busy ? "Đang lưu…" : "Lưu bản nháp"}</button>
        </fieldset>
      </form>
      {picked && canManage && (
        <div className="live-toolbar">
          {picked.status === "DRAFT" && (
            <button disabled={busy} onClick={() => void send("publish")}>
              Công bố phiên bản {picked.revision}
            </button>
          )}
          {picked.status === "PUBLISHED" && (
            <button disabled={busy} onClick={() => void send("retire")}>
              Ngừng áp dụng cho bàn giao mới
            </button>
          )}
        </div>
      )}
    </section>
  );
}
