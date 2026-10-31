import { useState, type FormEvent, type ReactNode } from 'react'
import { api } from '../api/client'
import { getSessionGeneration } from '../auth/session'
import type { Page } from '../types/domain'

import { errorText, useDirectory, type DirectoryRow } from './registration-data'
export type { DirectoryRow } from './registration-data'

export function SetupPage({
  title,
  description,
  children,
  actions,
}: {
  title: string
  description?: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="registration-page">
      <header className="registration-header">
        <div>
          <span className="m1-eyebrow">HỒ SƠ SAU BÀN GIAO</span>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        <div className="registration-actions">{actions}</div>
      </header>
      {children}
    </div>
  )
}
export function LoadState({
  loading,
  error,
}: {
  loading: boolean
  error: string
}) {
  return loading ? (
    <p role="status">Đang tải…</p>
  ) : error ? (
    <p className="m1-error" role="alert">
      {error}
    </p>
  ) : null
}
type Field = {
  key: string
  label: string
  required?: boolean
  type?: string
  max?: number
}
export type QuickKind = 'customer' | 'site' | 'model' | 'contact' | 'location'
const fields: Record<QuickKind, Field[]> = {
  customer: [
    { key: 'code', label: 'Mã khách hàng', required: true, max: 50 },
    { key: 'name', label: 'Tên doanh nghiệp', required: true, max: 200 },
    { key: 'taxCode', label: 'Mã số thuế', max: 50 },
    { key: 'email', label: 'Email', type: 'email', max: 255 },
    { key: 'phone', label: 'Điện thoại', max: 30 },
    { key: 'address', label: 'Địa chỉ', max: 2000 },
  ],
  site: [
    { key: 'code', label: 'Mã địa điểm', required: true, max: 50 },
    { key: 'name', label: 'Tên địa điểm', required: true, max: 150 },
    {
      key: 'address',
      label: 'Địa chỉ đặt thiết bị',
      required: true,
      max: 2000,
    },
  ],
  model: [
    { key: 'manufacturer', label: 'Hãng sản xuất', required: true, max: 150 },
    { key: 'modelCode', label: 'Mã model', required: true, max: 100 },
    { key: 'name', label: 'Tên dòng thiết bị', required: true, max: 200 },
    { key: 'category', label: 'Nhóm thiết bị', max: 100 },
    { key: 'description', label: 'Mô tả' },
  ],
  contact: [
    { key: 'name', label: 'Tên người liên hệ', required: true, max: 150 },
    { key: 'email', label: 'Email', type: 'email', max: 255 },
    { key: 'phone', label: 'Điện thoại', max: 30 },
    { key: 'position', label: 'Chức vụ', max: 100 },
  ],
  location: [
    { key: 'code', label: 'Mã vị trí', max: 50 },
    { key: 'name', label: 'Tên vị trí', required: true, max: 150 },
  ],
}
export function QuickForm({
  kind,
  path,
  onSaved,
  onCancel,
  initial,
  embedded = true,
}: {
  kind: QuickKind
  path: string
  onSaved: (row: DirectoryRow) => void
  onCancel: () => void
  initial?: DirectoryRow
  embedded?: boolean
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const edit = Boolean(initial)
  const shown = fields[kind].filter(
    (field) =>
      !edit || !['code', 'manufacturer', 'modelCode'].includes(field.key),
  )
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const operationGeneration = getSessionGeneration()
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const body: Record<string, unknown> = Object.fromEntries(
      shown
        .map((field) => [field.key, String(form.get(field.key) ?? '').trim()])
        .filter(([, value]) => value !== ''),
    )
    if (edit)
      for (const field of shown) {
        if (!field.required && !String(form.get(field.key) ?? '').trim())
          body[field.key] = null
      }
    if (kind === 'location') body.type = String(form.get('type'))
    if (kind === 'contact' && form.get('customerSiteId'))
      body.customerSiteId = String(form.get('customerSiteId'))
    try {
      const row =
        kind === 'model'
          ? await api.assetM2<DirectoryRow>(path, {
              method: edit ? 'PATCH' : 'POST',
              body,
            })
          : await api.organization<DirectoryRow>(path, {
              method: edit ? 'PATCH' : 'POST',
              body,
            })
      if (operationGeneration === getSessionGeneration()) onSaved(row)
    } catch (error) {
      setError(errorText(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      className={embedded ? 'registration-inline-form m1-card' : 'm1-card'}
    >
      <h2>
        {edit
          ? 'Cập nhật thông tin'
          : `Thêm ${{ customer: 'khách hàng', site: 'địa điểm', model: 'model thiết bị', contact: 'người liên hệ', location: 'vị trí' }[kind]}`}
      </h2>
      <p>
        Thông tin được lưu vào danh mục của doanh nghiệp ngay khi bạn bấm Lưu.
      </p>
      <form onSubmit={submit} className="registration-fields">
        {shown.map((field, index) => (
          <label key={field.key}>
            {field.label}
            {field.required ? ' *' : ''}
            <input
              name={field.key}
              autoFocus={index === 0}
              required={field.required}
              type={field.type || 'text'}
              maxLength={field.max}
              defaultValue={String(
                (initial as Record<string, unknown> | undefined)?.[field.key] ??
                  '',
              )}
              disabled={busy}
            />
          </label>
        ))}
        {kind === 'location' && (
          <label>
            Loại vị trí
            <select name="type">
              <option value="AREA">Khu vực</option>
              <option value="BUILDING">Tòa nhà</option>
              <option value="FLOOR">Tầng</option>
              <option value="ROOM">Phòng</option>
            </select>
          </label>
        )}
        {error && (
          <p className="m1-error registration-wide" role="alert">
            {error}
          </p>
        )}
        <div className="registration-actions registration-wide">
          <button disabled={busy}>
            {busy ? 'Đang lưu…' : 'Lưu thông tin'}
          </button>
          <button type="button" disabled={busy} onClick={onCancel}>
            Đóng
          </button>
        </div>
      </form>
    </section>
  )
}
export function DirectoryPicker({
  label,
  area,
  path,
  selected,
  onChange,
  onAdd,
  revision = 0,
}: {
  label: string
  area: 'organization' | 'assetM2'
  path: string | null
  selected: string
  onChange: (id: string) => void
  onAdd?: () => void
  revision?: number
}) {
  const [draft, setDraft] = useState(''),
    [q, setQ] = useState(''),
    [page, setPage] = useState(1)
  const target = path
    ? `${path}${path.includes('?') ? '&' : '?'}page=${page}&pageSize=20&q=${encodeURIComponent(q)}`
    : null
  const state = useDirectory<Page<DirectoryRow>>(area, target, revision)
  // The selected ID stays visible even when a different page is being searched.
  return (
    <fieldset className="registration-picker">
      <legend>{label}</legend>
      <div className="registration-actions">
        <input
          aria-label={`Tìm ${label}`}
          placeholder="Tìm theo tên hoặc mã…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            setQ(draft)
            setPage(1)
          }}
          disabled={!path}
        >
          Tìm
        </button>
        {onAdd && (
          <button type="button" onClick={onAdd}>
            + Thêm
          </button>
        )}
      </div>
      <LoadState {...state} />
      <select
        aria-label={label}
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        disabled={!path || state.loading}
      >
        <option value="">Chọn {label.toLowerCase()}</option>
        {selected && !state.value?.items.some((row) => row.id === selected) && (
          <option value={selected}>Đã chọn · {selected}</option>
        )}
        {state.value?.items.map((row) => (
          <option key={row.id} value={row.id}>
            {[
              row.code,
              row.assetCode,
              row.serialNumber,
              row.manufacturer,
              row.modelCode,
              row.name,
            ]
              .filter(Boolean)
              .join(' · ')}
          </option>
        ))}
      </select>
      {state.value && (
        <div className="registration-pagination">
          <span>
            Trang {page} · {state.value.total} kết quả
          </span>
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Trước
          </button>
          <button
            type="button"
            disabled={page * 20 >= state.value.total}
            onClick={() => setPage(page + 1)}
          >
            Sau
          </button>
        </div>
      )}
    </fieldset>
  )
}
