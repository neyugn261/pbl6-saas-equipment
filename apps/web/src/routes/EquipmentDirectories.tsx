import { SiteBranchRouting } from "../features/workspace/BranchManagement";
import SiteLocationTree from '../features/workspace/LocationTreeView';
import TableToolbar from '../features/workspace/TableToolbar';
import CustomerOverview, { CustomerMaintenance } from '../features/workspace/CustomerOverview';
import {
  ServiceSections,
  ServiceFacts,
  ServiceNotice,
} from "../features/workspace/ServiceDetailUI";
import CustomerServicePanel from "../features/workspace/CustomerServicePanel";
import { useState } from "react";
import { Ban, CircleCheck, Eye, Plus } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useSession } from "../auth/session";
import { StatusBadge } from "../components/Badges";
import type { Page } from "../types/domain";
import { DirectoryPagination, LoadState, QuickForm, SetupPage } from "./registration-shared";
import {
  type DirectoryRow,
  errorText,
  setupRoles,
  useDirectory,
} from "./registration-data";
import "./equipment-registration.css";

export function CustomerDirectoryPage() {
  const { profile } = useSession();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '', status = params.get('status') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  function filter(values: Record<string, string>) {
    const next = new URLSearchParams(params); next.delete('page');
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    setParams(next, { replace: true });
  }
  const state = useDirectory<Page<DirectoryRow>>(
    "organization",
    `/customers?page=${page}&pageSize=20&q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`,
  );
  const manage = profile?.roles.some((role) => setupRoles.includes(role));
  return (
    <SetupPage
      title="Khách hàng"
      description="Doanh nghiệp đang sử dụng thiết bị và các địa điểm được phục vụ."
      actions={
        manage && (
          <Link className="m1-button" to="/app/customers/new">
            + Thêm khách hàng
          </Link>
        )
      }
    >
      <section className="m1-card registration-directory">
        <TableToolbar query={q} onQuery={value => filter({ q: value })} placeholder="Tìm tên hoặc mã khách hàng…" onReset={() => setParams({})}>
          <label>Trạng thái<select value={status} onChange={event => filter({ status: event.target.value })}><option value="">Tất cả</option><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option></select></label>
        </TableToolbar>
        <LoadState {...state} />
        {state.value && (
          <>
            <div className="registration-directory__table"><table>
              <thead>
                <tr>
                  <th>Khách hàng</th>
                  <th>Liên hệ</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.value.items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link to={`/app/customers/${row.id}`}>{row.name}</Link>
                      <small>{row.code}</small>
                    </td>
                    <td>{row.email || row.phone || "Chưa có"}</td>
                    <td><StatusBadge status={row.status || "INACTIVE"} label={row.status === "ACTIVE" ? "Đang hoạt động" : "Ngừng hoạt động"} /></td>
                    <td>
                      {manage && row.status === "ACTIVE" && (
                        <Link
                          to={`/app/equipment-registrations/new?customerId=${row.id}`}
                        >
                          Ghi nhận bàn giao
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {state.value.items.length === 0 && (
              <p className="registration-directory__empty">Chưa có khách hàng phù hợp.</p>
            )}
            <DirectoryPagination page={page} total={state.value.total} label="khách hàng" onChange={value => { const next = new URLSearchParams(params); next.set('page', String(value)); setParams(next); }} />
          </>
        )}
      </section>
    </SetupPage>
  );
}
export function CustomerCreatePage() {
  const navigate = useNavigate();
  return (
    <SetupPage
      title="Thêm khách hàng"
      back={{ to: "/app/customers", label: "Về danh sách khách hàng" }}
      description="Tạo hồ sơ doanh nghiệp; tài khoản Customer Portal được mời riêng theo quyền."
    >
      <QuickForm
        embedded={false}
        kind="customer"
        path="/customers"
        onSaved={(row) => navigate(`/app/customers/${row.id}`)}
        onCancel={() => navigate("/app/customers")}
      />
    </SetupPage>
  );
}
export function CustomerWorkspacePage() {
  const { id } = useParams(),
    { profile } = useSession(),
    [revision, setRevision] = useState(0);
  const [form, setForm] = useState<{
    kind: "customer" | "site" | "contact";
    row?: DirectoryRow;
  } | null>(null);
  const state = useDirectory<DirectoryRow>(
    "organization",
    `/customers/${id}`,
    revision,
  );
  const sites = useDirectory<DirectoryRow[]>(
    "organization",
    `/customers/${id}/sites`,
    revision,
  );
  const contacts = useDirectory<DirectoryRow[]>(
    "organization",
    `/customers/${id}/contacts`,
    revision,
  );
  const manage = profile?.roles.some((role) => setupRoles.includes(role));
  const path =
    form?.kind === "customer"
      ? `/customers/${id}`
      : form?.kind === "site"
        ? form.row
          ? `/sites/${form.row.id}`
          : `/customers/${id}/sites`
        : `/customers/${id}/contacts`;
  return (
    <SetupPage
      title={state.value?.name || "Chi tiết khách hàng"}
      back={{ to: "/app/customers", label: "Về danh sách khách hàng" }}
      description={
        state.value
          ? `${state.value.code} · ${state.value.address || "Chưa có địa chỉ"}`
          : undefined
      }
      actions={
        manage && state.value?.status === "ACTIVE" && (
          <Link
            className="m1-button"
            to={`/app/equipment-registrations/new?customerId=${id}`}
          >
            Ghi nhận bàn giao
          </Link>
        )
      }
    >
      <LoadState {...state} />
      {state.value && id && <CustomerOverview key={id} customerId={id}/>}
      <ServiceNotice title="Hồ sơ phục vụ chăm sóc sau bán hàng">
        <p>
          Quản lý địa điểm đặt thiết bị và đầu mối liên hệ để tiếp nhận, điều
          phối dịch vụ đúng nơi.
        </p>
      </ServiceNotice>
      {state.value && (
        <section className="m1-card">
          <h2>Thông tin doanh nghiệp</h2>
          <ServiceFacts
            items={[
              { label: "Mã khách hàng", value: state.value.code },
              {
                label: "Mã số thuế",
                value: state.value.taxCode || "Chưa ghi nhận",
              },
              {
                label: "Email",
                value: state.value.email ? (
                  <a href={`mailto:${state.value.email}`}>
                    {state.value.email}
                  </a>
                ) : (
                  "Chưa có email"
                ),
              },
              {
                label: "Điện thoại",
                value: state.value.phone ? (
                  <a href={`tel:${state.value.phone}`}>{state.value.phone}</a>
                ) : (
                  "Chưa có điện thoại"
                ),
              },
            ]}
          />
          {manage && (
            <button
              onClick={() => setForm({ kind: "customer", row: state.value! })}
            >
              Chỉnh sửa khách hàng
            </button>
          )}
        </section>
      )}
      {form && (
        <QuickForm
          key={`${form.kind}:${form.row?.id || "new"}`}
          kind={form.kind}
          path={path}
          initial={form.row}
          onSaved={() => {
            setForm(null);
            setRevision((v) => v + 1);
          }}
          onCancel={() => setForm(null)}
        />
      )}
      <ServiceSections
        items={[
          { key: 'overview', label: 'Tổng quan', content: id && <CustomerServicePanel key={id} customerId={id}/> },
          {
            key: "sites",
            label: "Vị trí & thiết bị",
            content: (
              <section className="m1-card">
                <div className="registration-header">
                  <h2>Địa điểm đặt thiết bị</h2>
                  {manage && (
                    <button onClick={() => setForm({ kind: "site" })}>
                      + Thêm địa điểm
                    </button>
                  )}
                </div>
                <LoadState {...sites} />
                {sites.value?.length === 0 && (
                  <p>
                    Chưa có địa điểm. Cần tạo địa điểm thực tế trước khi ghi
                    nhận máy.
                  </p>
                )}
                <div className="registration-cards">
                  {sites.value?.map((row) => (
                    <article key={row.id}>
                      <h3>{row.name}</h3>
                      <SiteLocationTree siteId={row.id}/>
                      <p>
                        {row.code} · {row.address}
                      </p>
                      <p>
                        {row.status === "ACTIVE"
                          ? "Đang hoạt động"
                          : "Ngừng hoạt động"}
                      </p>
                      {profile?.roles.includes("TENANT_ADMIN") && (
                        <SiteBranchRouting
                          key={`${row.id}:${revision}`}
                          siteId={row.id}
                          branchId={row.defaultServicingBranchId}
                          onSaved={() => setRevision((v) => v + 1)}
                        />
                      )}
                      {manage && (
                        <div className="registration-actions">
                          <button
                            onClick={() => setForm({ kind: "site", row })}
                          >
                            Chỉnh sửa
                          </button>
                          {row.status === "ACTIVE" && (
                            <Link
                              to={`/app/equipment-registrations/new?customerId=${id}&siteId=${row.id}`}
                            >
                              Ghi nhận bàn giao tại đây
                            </Link>
                          )}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
                {id && <CustomerServicePanel customerId={id} mode="equipment"/>}
              </section>
            ),
          },
          {
            key: "contacts",
            label: "Người liên hệ",
            content: (
              <section className="m1-card">
                <div className="registration-header">
                  <h2>Người liên hệ</h2>
                  {manage && (
                    <button onClick={() => setForm({ kind: "contact" })}>
                      + Thêm liên hệ
                    </button>
                  )}
                </div>
                <LoadState {...contacts} />
                {contacts.value?.length === 0 && <p>Chưa có người liên hệ.</p>}
                {contacts.value?.map((row) => (
                  <p key={row.id}>
                    <strong>{row.name}</strong> ·{" "}
                    {row.email && (
                      <a href={`mailto:${row.email}`}>{row.email}</a>
                    )}
                    {row.email && row.phone && " · "}
                    {row.phone && <a href={`tel:${row.phone}`}>{row.phone}</a>}
                    {!row.email && !row.phone && "Chưa có thông tin liên lạc"}
                  </p>
                ))}
              </section>
            ),
          },
          {
            key: "services",
            label: "Yêu cầu & lệnh",
            content: id && <CustomerServicePanel key={id} customerId={id} mode="requests" />,
          },
          { key: 'maintenance', label: 'Kế hoạch bảo trì', content: id && <CustomerMaintenance key={id} customerId={id}/> },
        ]}
      />
    </SetupPage>
  );
}
export function EquipmentModelsPage() {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const state = useDirectory<Page<DirectoryRow>>(
    "assetM2",
    `/equipment-models?page=${page}&pageSize=20&q=${encodeURIComponent(q)}`,
    revision,
  );
  async function toggle(row: DirectoryRow) {
    const active = row.status === "ACTIVE";
    const prompt = active
      ? `Ngừng dùng model ${row.name}? Model sẽ bị ẩn khi chọn cho thiết bị mới. Hồ sơ nháp dùng chính sách model phải chờ kích hoạt lại để tiếp tục. Thiết bị đã ghi nhận và hồ sơ đã gửi vẫn được giữ lại.`
      : `Kích hoạt model ${row.name} để có thể chọn lại khi đăng ký thiết bị?`;
    if (busy || !window.confirm(prompt)) return;
    setBusy(true);
    setError("");
    try {
      await api.assetM2(`/equipment-models/${row.id}`, {
        method: "PATCH",
        body: { status: active ? "INACTIVE" : "ACTIVE" },
      });
      setRevision((v) => v + 1);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SetupPage
      title="Danh mục model thiết bị"
      actions={
        <button
          type="button"
          className="ws-button registration-primary"
          onClick={() => setCreating(true)}
        >
          <Plus size={16} aria-hidden="true" />
          Thêm model
        </button>
      }
    >
      {creating && (
        <QuickForm
          kind="model"
          path="/equipment-models"
          onSaved={() => {
            setCreating(false);
            setRevision((v) => v + 1);
          }}
          onCancel={() => setCreating(false)}
        />
      )}
      <section className="m1-card registration-directory" aria-label="Danh mục model thiết bị">
        <TableToolbar
          query={q}
          onQuery={(value) => {
            setPage(1);
            setQ(value);
          }}
          placeholder="Tìm tên, mã model hoặc hãng sản xuất…"
        />
        {(state.loading || state.error || error) && (
          <div className="ws-card-body">
            <LoadState {...state} />
            {error && <p className="m1-error" role="alert">{error}</p>}
          </div>
        )}
        {state.value && (
          <>
            {state.value.items.length > 0 ? (
              <div className="registration-directory__table" role="region" aria-label="Bảng danh mục model" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Tên model</th>
                      <th scope="col">Mã model</th>
                      <th scope="col">Hãng sản xuất</th>
                      <th scope="col">Số thiết bị</th>
                      <th scope="col">Trạng thái</th>
                      <th scope="col">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.value.items.map((row) => {
                      const modelPath = `/app/equipment-models/${row.id}`;
                      const active = row.status === "ACTIVE";
                      const availabilityAction = active ? "Ngừng dùng" : "Kích hoạt";
                      return (
                        <tr key={row.id}>
                          <td><Link to={modelPath}>{row.name}</Link></td>
                          <td>{row.modelCode || "—"}</td>
                          <td>{row.manufacturer || "—"}</td>
                          <td>{row.equipmentCount ?? "—"}</td>
                          <td>
                            <StatusBadge status={active ? "ACTIVE" : "INACTIVE"} label={active ? "Đang dùng" : "Ngừng dùng"} />
                          </td>
                          <td>
                            <div className="registration-actions model-row-actions">
                              <Link
                                to={modelPath}
                                className="model-row-action"
                                title="Xem chi tiết / Chính sách"
                                aria-label={`Xem chi tiết và chính sách của ${row.name}`}
                              >
                                <Eye size={16} aria-hidden="true" />
                              </Link>
                              <button
                                type="button"
                                className={`model-row-action${active ? " model-row-action--deactivate" : ""}`}
                                title={availabilityAction}
                                aria-label={`${availabilityAction} model ${row.name}`}
                                disabled={busy}
                                onClick={() => void toggle(row)}
                              >
                                {active ? <Ban size={16} aria-hidden="true" /> : <CircleCheck size={16} aria-hidden="true" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="registration-directory__empty">
                {q ? "Không tìm thấy model phù hợp." : "Danh mục chưa có model thiết bị."}
              </p>
            )}
            {state.value.total > 0 && (
              <DirectoryPagination page={page} total={state.value.total} label="model" onChange={setPage} />
            )}
          </>
        )}
      </section>
    </SetupPage>
  );
}
