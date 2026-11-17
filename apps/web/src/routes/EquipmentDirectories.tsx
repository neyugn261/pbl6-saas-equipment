import { SiteBranchRouting } from "../features/workspace/BranchManagement";
import {
  ServiceSections,
  ServiceFacts,
  ServiceNotice,
} from "../features/workspace/ServiceDetailUI";
import CustomerServicePanel from "../features/workspace/CustomerServicePanel";
import { useState } from "react";
import { Ban, CircleCheck, Pencil, Search } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
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

export function CustomerDirectoryPage() {
  const { profile } = useSession(),
    [draft, setDraft] = useState(""),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1);
  const state = useDirectory<Page<DirectoryRow>>(
    "organization",
    `/customers?page=${page}&pageSize=20&q=${encodeURIComponent(q)}`,
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
        <form
          className="registration-directory__toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(draft);
            setPage(1);
          }}
        >
          <label className="registration-directory__search"><Search size={17} aria-hidden="true" /><input
            aria-label="Tìm khách hàng"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Tìm tên hoặc mã khách hàng…"
          /></label>
          <button type="submit" className="registration-directory__search-button">Tìm</button>
        </form>
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
            <DirectoryPagination page={page} total={state.value.total} label="khách hàng" onChange={setPage} />
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
      description={
        state.value
          ? `${state.value.code} · ${state.value.address || "Chưa có địa chỉ"}`
          : undefined
      }
      actions={
        <>
          <Link to="/app/customers">← Khách hàng</Link>
          {manage && state.value?.status === "ACTIVE" && (
            <Link
              className="m1-button"
              to={`/app/equipment-registrations/new?customerId=${id}`}
            >
              Ghi nhận bàn giao
            </Link>
          )}
        </>
      }
    >
      <LoadState {...state} />
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
          {
            key: "sites",
            label: "Địa điểm đặt thiết bị",
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
            label: "Thiết bị & dịch vụ",
            content: id && <CustomerServicePanel key={id} customerId={id} />,
          },
        ]}
      />
    </SetupPage>
  );
}
export function EquipmentModelsPage() {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [form, setForm] = useState<DirectoryRow | "new" | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const state = useDirectory<Page<DirectoryRow>>(
    "assetM2",
    `/equipment-models?page=${page}&pageSize=20&q=${encodeURIComponent(q)}`,
    revision,
  );
  async function toggle(row: DirectoryRow) {
    if (
      !window.confirm(
        `${row.status === "ACTIVE" ? "Ngừng dùng" : "Kích hoạt"} model ${row.name}? Thiết bị và lịch sử đã có được giữ nguyên.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api.assetM2(`/equipment-models/${row.id}`, {
        method: "PATCH",
        body: { status: row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
      });
      setRevision((v) => v + 1);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const edit = form;
  return (
    <SetupPage
      title="Danh mục model thiết bị"
      description="Mỗi model là một dòng sản phẩm. Serial và chính sách thực tế được ghi riêng cho từng máy."
      actions={<button type="button" className="registration-primary" onClick={() => setForm("new")}>+ Thêm model</button>}
    >
      {edit && (
        <QuickForm
          key={edit === "new" ? "new" : edit.id}
          kind="model"
          path={
            edit === "new"
              ? "/equipment-models"
              : `/equipment-models/${edit.id}`
          }
          initial={edit === "new" ? undefined : edit}
          onSaved={() => {
            setForm(null);
            setRevision((v) => v + 1);
          }}
          onCancel={() => setForm(null)}
        />
      )}
      <section className="m1-card registration-directory registration-directory--models">
        <form
          className="registration-directory__toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQ(String(new FormData(e.currentTarget).get("q") || ""));
          }}
        >
          <label className="registration-directory__search"><Search size={17} aria-hidden="true" /><input name="q" aria-label="Tìm model thiết bị" placeholder="Tìm hãng, mã model hoặc tên…" /></label>
          <button type="submit" className="registration-directory__search-button">Tìm</button>
        </form>
        <LoadState {...state} />
        {error && (
          <p className="m1-error" role="alert">
            {error}
          </p>
        )}
        {state.value && (
          <>
            <div className="registration-directory__table"><table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Hãng</th>
                  <th>Nhóm</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.value.items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link className="registration-directory__name" to={`/app/equipment-models/${row.id}`}>
                        {row.name}
                      </Link>
                      <small>{row.modelCode}</small>
                    </td>
                    <td>{row.manufacturer}</td>
                    <td>{row.category || "Chưa phân nhóm"}</td>
                    <td><StatusBadge status={row.status || "INACTIVE"} label={row.status === "ACTIVE" ? "Đang dùng" : "Ngừng dùng"} /></td>
                    <td>
                      <div className="registration-actions registration-directory__row-actions">
                        <Link to={`/app/equipment-models/${row.id}`}>
                          Chính sách dịch vụ
                        </Link>
                        <button className="registration-directory__action" disabled={busy} onClick={() => setForm(row)}>
                          <Pencil size={14} aria-hidden="true" />
                          Sửa
                        </button>
                        <button
                          className={`registration-directory__action${row.status === "ACTIVE" ? " registration-directory__action--danger" : ""}`}
                          disabled={busy}
                          onClick={() => void toggle(row)}
                        >
                          {row.status === "ACTIVE" ? <Ban size={14} aria-hidden="true" /> : <CircleCheck size={14} aria-hidden="true" />}
                          {row.status === "ACTIVE" ? "Ngừng dùng" : "Kích hoạt"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {state.value.items.length === 0 && (
              <p className="registration-directory__empty">
                Chưa có model phù hợp. Thêm model từ catalogue của doanh nghiệp
                hoặc hãng.
              </p>
            )}
            <DirectoryPagination page={page} total={state.value.total} label="model" onChange={setPage} />
          </>
        )}
      </section>
    </SetupPage>
  );
}
