import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api } from '../api/client'
import { getSessionGeneration } from '../auth/session'
import type { Page } from '../types/domain'
import { PageTitle, type PageTitleBack } from '../components/PageTitle'

import { errorText, useDirectory, type DirectoryRow } from './registration-data'
export type { DirectoryRow } from './registration-data'

export function SetupPage({
  title,
  description,
  children,
  actions,
  back,
}: {
  title: string
  description?: string
  children: ReactNode
  actions?: ReactNode
  back?: PageTitleBack
}) {
  return (
    <div className="registration-page">
      <header className="registration-header page-title-header">
        <PageTitle title={title} back={back} />
        {actions && <div className="registration-actions page-title-actions">{actions}</div>}
        {description && <p className="page-title-description">{description}</p>}
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

export function DirectoryPagination({
  page,
  total,
  label,
  onChange,
}: {
  page: number
  total: number
  label: string
  onChange: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / 20))
  return <footer className="registration-directory__pagination">
    <span>Trang {page}/{pages} · {total} {label}</span>
    <div>
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>Trước</button>
      <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>Sau</button>
    </div>
  </footer>
}
type Field = {
  key: string
  label: string
  required?: boolean
  type?: string
  max?: number
  readonly?: boolean
  placeholder?: string
  hint?: string
  wide?: boolean
}
function generateSiteCode(): string {
  return `CS-${Date.now().toString().slice(-6)}`
}
export type QuickKind = 'customer' | 'site' | 'model' | 'contact' | 'location'
const fields: Record<QuickKind, Field[]> = {
  customer: [
    {
      key: 'code',
      label: 'Mã khách hàng',
      required: true,
      max: 50,
      placeholder: 'Ví dụ: KH-001 hoặc CTY-ACHAU',
      hint: 'Mẫu: KH-001, CTY-ACHAU, DL-HOALONG...',
    },
    {
      key: 'name',
      label: 'Tên doanh nghiệp',
      required: true,
      max: 200,
      placeholder: 'Ví dụ: Công ty TNHH Cơ điện & Thiết bị Á Châu',
    },
    { key: 'taxCode', label: 'Mã số thuế', max: 50, placeholder: 'Ví dụ: 0101234567' },
    { key: 'email', label: 'Email', type: 'email', max: 255, placeholder: 'contact@doanhnghiep.vn' },
    { key: 'phone', label: 'Điện thoại', max: 30, placeholder: 'Ví dụ: 0905123456' },
    {
      key: 'address',
      label: 'Địa chỉ',
      max: 2000,
      wide: true,
      placeholder: 'Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành phố',
      hint: 'Mẫu: Số 123 Đường Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    },
  ],
  site: [
    {
      key: 'name',
      label: 'Tên địa điểm',
      required: true,
      max: 150,
      wide: true,
      placeholder: 'Nhập tên địa điểm hoặc cơ sở',
      hint: 'Mẫu: Trụ sở chính, Xưởng sản xuất số 1, Chi nhánh Đà Nẵng, Kho Hòa Khánh...',
    },
    {
      key: 'address',
      label: 'Địa chỉ đặt thiết bị',
      required: true,
      max: 2000,
      wide: true,
      placeholder: 'Số nhà, tên đường, KCN, quận/huyện, tỉnh/thành phố',
      hint: 'Mẫu: Lô B2-5, KCN Hòa Khánh, Phường Hòa Khánh Bắc, Quận Liên Chiểu, TP. Đà Nẵng',
    },
  ],
  model: [
    { key: 'manufacturer', label: 'Hãng sản xuất', required: true, max: 150, placeholder: 'Ví dụ: VinaPump' },
    { key: 'modelCode', label: 'Mã model', required: true, max: 100, placeholder: 'Ví dụ: PUMP-200' },
    { key: 'name', label: 'Tên dòng thiết bị', required: true, max: 200, wide: true, placeholder: 'Ví dụ: Máy bơm ly tâm công nghiệp' },
    { key: 'description', label: 'Mô tả', type: 'textarea', wide: true },
  ],
  contact: [
    { key: 'name', label: 'Tên người liên hệ', required: true, max: 150, placeholder: 'Ví dụ: Nguyễn Văn A' },
    { key: 'position', label: 'Chức vụ', max: 100, placeholder: 'Ví dụ: Quản lý kỹ thuật, Trưởng phòng vật tư...' },
    { key: 'email', label: 'Email', type: 'email', max: 255, placeholder: 'nguyenvana@doanhnghiep.vn' },
    { key: 'phone', label: 'Điện thoại', max: 30, placeholder: 'Ví dụ: 0912345678' },
  ],
  location: [
    {
      key: 'area',
      label: 'Khu vực',
      max: 50,
      placeholder: 'Ví dụ: Khu vực A, Khu A...',
    },
    {
      key: 'building',
      label: 'Tòa nhà',
      max: 50,
      placeholder: 'Ví dụ: Tòa nhà B, Nhà xưởng 1...',
    },
    {
      key: 'floor',
      label: 'Tầng',
      max: 30,
      placeholder: 'Ví dụ: Tầng C, Tầng 3...',
    },
    {
      key: 'room',
      label: 'Phòng',
      max: 50,
      placeholder: 'Ví dụ: Phòng D, Phòng 302...',
    },
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
  const model = kind === 'model'

  useEffect(() => {
    if (!embedded) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onCancel()
      }
    }
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [embedded, busy, onCancel])

  const shown = fields[kind].filter(
    (field) =>
      !edit || !['code', 'manufacturer', 'modelCode'].includes(field.key),
  )
  const firstEditableIndex = shown.findIndex((field) => !field.readonly)
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
    if (kind === 'site' && !body.code) {
      body.code = generateSiteCode()
    }
    if (kind === 'location') {
      const area = String(form.get('area') ?? '').trim()
      const building = String(form.get('building') ?? '').trim()
      const floor = String(form.get('floor') ?? '').trim()
      const room = String(form.get('room') ?? '').trim()

      if (!area && !building && !floor && !room) {
        setError(
          'Vui lòng nhập ít nhất một thông tin vị trí (Khu vực, Tòa nhà, Tầng hoặc Phòng).',
        )
        setBusy(false)
        return
      }

      const parts: string[] = []
      if (area) parts.push(/^khu/i.test(area) ? area : `Khu vực ${area}`)
      if (building)
        parts.push(
          /^(tòa|nhà|building)/i.test(building)
            ? building
            : `Tòa nhà ${building}`,
        )
      if (floor) parts.push(/^tầng/i.test(floor) ? floor : `Tầng ${floor}`)
      if (room) parts.push(/^phòng/i.test(room) ? room : `Phòng ${room}`)

      body.name = parts.join(', ')

      let locationType: 'ROOM' | 'FLOOR' | 'BUILDING' | 'AREA' = 'ROOM'
      if (room) locationType = 'ROOM'
      else if (floor) locationType = 'FLOOR'
      else if (building) locationType = 'BUILDING'
      else if (area) locationType = 'AREA'

      body.type = locationType
      delete body.area
      delete body.building
      delete body.floor
      delete body.room
    }
    if (edit)
      for (const field of shown) {
        if (!field.required && !String(form.get(field.key) ?? '').trim())
          body[field.key] = null
      }
    if (kind === 'contact' && form.get('customerSiteId'))
      body.customerSiteId = String(form.get('customerSiteId'))
    try {
      const row =
        kind === 'model'
          ? await api.assetM2<DirectoryRow>(path, {
              method: 'POST',
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

  const title = edit
    ? 'Cập nhật thông tin'
    : `Thêm ${{ customer: 'khách hàng', site: 'địa điểm', model: 'model thiết bị', contact: 'người liên hệ', location: 'vị trí chi tiết' }[kind]}`
  const saveLabel = model ? 'Thêm model' : 'Lưu thông tin'
  const cancelButton = (
    <button type="button" className="ws-button ws-button--secondary" disabled={busy} onClick={onCancel}>
      {model ? 'Hủy' : 'Đóng'}
    </button>
  )

  const formContent = (
    <>
      <div className="registration-modal-header">
        <h2 id="quick-form-title">{title}</h2>
        {embedded && (
          <button
            type="button"
            className="registration-modal-close"
            onClick={onCancel}
            aria-label="Đóng pop-up"
            disabled={busy}
          >
            ×
          </button>
        )}
      </div>
      {!model && (
        <p className="registration-modal-subtitle">
          Thông tin được lưu vào danh mục của doanh nghiệp ngay khi bạn bấm Lưu.
        </p>
      )}
      <form onSubmit={submit} className="registration-fields">
        {shown.map((field, index) => {
          const value = String((initial as Record<string, unknown> | undefined)?.[field.key] ?? '')
          const inputProps = {
            name: field.key,
            autoFocus: index === firstEditableIndex,
            required: field.required,
            maxLength: field.max,
            placeholder: field.placeholder,
            defaultValue: value,
            disabled: busy,
          }
          return (
            <label key={field.key} className={field.wide ? 'registration-wide' : undefined}>
              <span>
                {field.label}
                {field.required ? <span className="required-star"> *</span> : ''}
              </span>
              {field.readonly ? (
                <input
                  name={field.key}
                  readOnly
                  tabIndex={-1}
                  value={value}
                  className="registration-readonly-field"
                  title="Trường chỉ đọc"
                />
              ) : field.type === 'textarea' ? (
                <textarea {...inputProps} rows={3} />
              ) : (
                <input {...inputProps} type={field.type || 'text'} />
              )}
              {field.hint && <small className="registration-field-hint">{field.hint}</small>}
            </label>
          )
        })}
        {kind === 'location' && (
          <p className="registration-field-hint registration-wide" style={{ margin: '4px 0 0' }}>
            Mẫu kết quả: Khu vực A, Tòa nhà B, Tầng C, Phòng D. Bạn có thể để trống các ô không áp dụng.
          </p>
        )}
        {error && (
          <p className="m1-error registration-wide" role="alert">
            {error}
          </p>
        )}
        <div className="registration-actions registration-wide">
          {model && cancelButton}
          <button type="submit" className="ws-button registration-primary" disabled={busy}>
            {busy ? 'Đang lưu…' : saveLabel}
          </button>
          {!model && cancelButton}
        </div>
      </form>
    </>
  )

  if (embedded) {
    return (
      <div
        className="registration-modal-backdrop"
        onClick={onCancel}
        role="presentation"
      >
        <section
          className={`registration-modal-card m1-card${model ? ' registration-modal-card--model' : ''}`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-form-title"
        >
          {formContent}
        </section>
      </div>
    )
  }

  return (
    <section className="registration-inline-form m1-card">
      {formContent}
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
  responseShape = 'page',
}: {
  label: string
  area: 'organization' | 'assetM2' | 'workorders'
  path: string | null
  selected: string
  onChange: (id: string) => void
  onAdd?: () => void
  revision?: number
  responseShape?: 'page' | 'list'
}) {
  const [draft, setDraft] = useState(''),
    [q, setQ] = useState(''),
    [page, setPage] = useState(1)
  const target = path
    ? responseShape === 'list'
      ? path
      : `${path}${path.includes('?') ? '&' : '?'}page=${page}&pageSize=20&q=${encodeURIComponent(q)}`
    : null
  const state = useDirectory<Page<DirectoryRow> | DirectoryRow[]>(area, target, revision)
  const list = responseShape === 'list' && Array.isArray(state.value)
    ? state.value.filter(row =>
        (row.status !== 'INACTIVE' || row.id === selected) &&
        [row.code, row.name, row.address].filter(Boolean).join(' ').toLocaleLowerCase('vi').includes(q.trim().toLocaleLowerCase('vi')),
      )
    : null
  const data = list
    ? { items: list.slice((page - 1) * 20, page * 20), total: list.length }
    : responseShape === 'page' && state.value && !Array.isArray(state.value) && Array.isArray(state.value.items)
      ? state.value
      : null
  const shapeError = state.value && !data ? 'Danh sách tải về không đúng định dạng. Vui lòng thử lại.' : ''
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
      <LoadState loading={state.loading} error={state.error || shapeError} />
      <select
        aria-label={label}
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        disabled={!path || state.loading || Boolean(state.error || shapeError)}
      >
        <option value="">Chọn {label.toLowerCase()}</option>
        {selected && !data?.items.some((row) => row.id === selected) && (
          <option value={selected}>Đã chọn · Tên chưa tải được</option>
        )}
        {data?.items.map((row) => (
          <option key={row.id} value={row.id}>
            {[
              row.code,
              row.employeeCode,
              row.fullName,
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
      {data && (
        <div className="registration-pagination">
          <span>
            Trang {page} · {data.total} kết quả
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
            disabled={page * 20 >= data.total}
            onClick={() => setPage(page + 1)}
          >
            Sau
          </button>
        </div>
      )}
    </fieldset>
  )
}

const RECENT_CUSTOMER_KEY = 'pbl6.recent_customer_ids'

function getRecentCustomerIds(): string[] {
  try {
    const raw = sessionStorage.getItem(RECENT_CUSTOMER_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveRecentCustomerId(id: string) {
  try {
    const list = getRecentCustomerIds().filter((item) => item !== id)
    list.unshift(id)
    sessionStorage.setItem(RECENT_CUSTOMER_KEY, JSON.stringify(list.slice(0, 10)))
  } catch {
    // ignore
  }
}

export function CustomerYouTubePicker({
  selectedId,
  selectedCustomer,
  onChange,
  onAdd,
  revision = 0,
}: {
  selectedId: string
  selectedCustomer?: DirectoryRow | null
  onChange: (id: string) => void
  onAdd?: () => void
  revision?: number
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [showResultsTable, setShowResultsTable] = useState(false)
  const [lastExecutedSearch, setLastExecutedSearch] = useState('')

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch active customers
  const customersQuery = useDirectory<Page<DirectoryRow>>(
    'organization',
    '/customers?status=ACTIVE&pageSize=100',
    revision,
  )

  const allCustomers = useMemo(
    () => customersQuery.value?.items || [],
    [customersQuery.value?.items],
  )

  // Determine current selected customer info
  const activeCustomer = useMemo(() => {
    if (selectedCustomer && selectedCustomer.id === selectedId) {
      return selectedCustomer
    }
    return allCustomers.find((c) => c.id === selectedId) || null
  }, [selectedCustomer, selectedId, allCustomers])

  // Save selected customer to recent history when selectedId is present
  useEffect(() => {
    if (selectedId) {
      saveRecentCustomerId(selectedId)
    }
  }, [selectedId])

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 5 recent customers
  const recentCustomers = useMemo(() => {
    const recentIds = getRecentCustomerIds()
    if (selectedId && !recentIds.includes(selectedId)) {
      recentIds.unshift(selectedId)
    }
    const fromHistory = recentIds
      .map((id) => allCustomers.find((c) => c.id === id))
      .filter((c): c is DirectoryRow => Boolean(c))

    const remaining = allCustomers.filter(
      (c) => !fromHistory.some((h) => h.id === c.id),
    )
    return [...fromHistory, ...remaining].slice(0, 5)
  }, [allCustomers, selectedId])

  // Real-time filtered customers
  const matchingCustomers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return []
    return allCustomers.filter((c) => {
      const name = (c.name || '').toLowerCase()
      const code = (c.code || '').toLowerCase()
      const taxCode = (c.taxCode || '').toLowerCase()
      const phone = (c.phone || '').toLowerCase()
      const address = (c.address || '').toLowerCase()
      return (
        name.includes(term) ||
        code.includes(term) ||
        taxCode.includes(term) ||
        phone.includes(term) ||
        address.includes(term)
      )
    })
  }, [allCustomers, searchTerm])

  const handleSelect = (c: DirectoryRow) => {
    saveRecentCustomerId(c.id)
    onChange(c.id)
    setShowDropdown(false)
    setShowResultsTable(false)
    setSearchTerm('')
  }

  const handleSearchSubmit = (e?: FormEvent) => {
    if (e) e.preventDefault()
    setShowDropdown(false)
    setLastExecutedSearch(searchTerm.trim())
    setShowResultsTable(true)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowDropdown(false)
      setShowResultsTable(false)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleSearchSubmit()
    }
  }

  // Customers for results table
  const tableResults = useMemo(() => {
    const term = lastExecutedSearch.toLowerCase()
    if (!term) return allCustomers
    return allCustomers.filter((c) => {
      const name = (c.name || '').toLowerCase()
      const code = (c.code || '').toLowerCase()
      const taxCode = (c.taxCode || '').toLowerCase()
      const phone = (c.phone || '').toLowerCase()
      const address = (c.address || '').toLowerCase()
      return (
        name.includes(term) ||
        code.includes(term) ||
        taxCode.includes(term) ||
        phone.includes(term) ||
        address.includes(term)
      )
    })
  }, [allCustomers, lastExecutedSearch])

  return (
    <div className="customer-yt-picker" ref={containerRef}>
      {/* Vùng tìm kiếm, thêm khách hàng (Vùng riêng phía trên) */}
      <div
        className={`customer-search-area ${
          showDropdown ? 'is-dropdown-open' : ''
        }`}
      >
        <label className="customer-yt-label" htmlFor="customer-yt-search-input">
          <span>Tìm kiếm khách hàng</span> <span className="required-star">*</span>
        </label>

        {/* YouTube Search Bar */}
        <div className="customer-yt-toolbar">
          <div className="customer-yt-search-wrapper">
            <div className="customer-yt-search-box">
              <span className="customer-yt-search-icon" aria-hidden="true">
                🔍
              </span>
              <input
                id="customer-yt-search-input"
                ref={inputRef}
                type="text"
                className="customer-yt-input"
                placeholder="Tìm kiếm khách hàng theo tên, mã KH, MST, SĐT, địa chỉ…"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setShowDropdown(true)
                }}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={handleKeyDown}
                autoComplete="off"
              />
              <button
                type="button"
                className="customer-yt-search-btn"
                onClick={() => handleSearchSubmit()}
                title="Tìm kiếm"
              >
                Tìm
              </button>
            </div>

            {/* Autocomplete Suggestions Dropdown */}
            {showDropdown && (
              <div className="customer-yt-dropdown" role="listbox">
                {!searchTerm.trim() ? (
                  <>
                    {recentCustomers.length === 0 ? (
                      <div className="customer-yt-empty-item">
                        Chưa có lịch sử khách hàng
                      </div>
                    ) : (
                      recentCustomers.map((c) => (
                        <div
                          key={c.id}
                          className={`customer-yt-dropdown-item ${
                            c.id === selectedId ? 'is-selected' : ''
                          }`}
                          onClick={() => handleSelect(c)}
                          role="option"
                          aria-selected={c.id === selectedId}
                        >
                          <span
                            className="customer-yt-item-icon"
                            aria-hidden="true"
                          >
                            🕒
                          </span>
                          <div className="customer-yt-item-info">
                            <div className="customer-yt-item-title">
                              <strong>{c.name}</strong>
                              {c.code && (
                                <span className="customer-yt-code-tag">
                                  {c.code}
                                </span>
                              )}
                              {c.id === selectedId && (
                                <span className="customer-yt-active-badge">
                                  Đang chọn
                                </span>
                              )}
                            </div>
                            <div className="customer-yt-item-meta">
                              {c.taxCode && <span>MST: {c.taxCode}</span>}
                              {c.phone && <span>SĐT: {c.phone}</span>}
                              {c.address && <span>Đ/c: {c.address}</span>}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </>
                ) : (
                  <>
                    {matchingCustomers.length === 0 ? (
                      <div className="customer-yt-empty-item">
                        <span>
                          Không tìm thấy khách hàng nào phù hợp với từ khóa.
                        </span>
                      </div>
                    ) : (
                      matchingCustomers.slice(0, 8).map((c) => (
                        <div
                          key={c.id}
                          className={`customer-yt-dropdown-item ${
                            c.id === selectedId ? 'is-selected' : ''
                          }`}
                          onClick={() => handleSelect(c)}
                          role="option"
                          aria-selected={c.id === selectedId}
                        >
                          <span
                            className="customer-yt-item-icon"
                            aria-hidden="true"
                          >
                            🔍
                          </span>
                          <div className="customer-yt-item-info">
                            <div className="customer-yt-item-title">
                              <strong>{c.name}</strong>
                              {c.code && (
                                <span className="customer-yt-code-tag">
                                  {c.code}
                                </span>
                              )}
                              {c.id === selectedId && (
                                <span className="customer-yt-active-badge">
                                  Đang chọn
                                </span>
                              )}
                            </div>
                            <div className="customer-yt-item-meta">
                              {c.taxCode && <span>MST: {c.taxCode}</span>}
                              {c.phone && <span>SĐT: {c.phone}</span>}
                              {c.address && <span>{c.address}</span>}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {onAdd && (
            <button
              type="button"
              className="ws-button ws-button--secondary customer-yt-add-btn"
              onClick={onAdd}
            >
              + Thêm khách hàng
            </button>
          )}
        </div>

        <LoadState {...customersQuery} />

        {/* Results Table Panel (When Search button clicked or Enter pressed) */}
        {showResultsTable && (
          <div className="customer-yt-results-panel">
            {tableResults.length === 0 ? (
              <div className="customer-yt-table-empty">
                <p>Không tìm thấy khách hàng nào phù hợp với từ khóa.</p>
              </div>
            ) : (
              <div className="customer-yt-table-scroll">
                <table className="customer-yt-table">
                  <thead>
                    <tr>
                      <th>Mã KH</th>
                      <th>Tên doanh nghiệp</th>
                      <th>Mã số thuế</th>
                      <th>Điện thoại</th>
                      <th>Địa chỉ</th>
                      <th style={{ textAlign: 'center', width: '110px' }}>
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableResults.map((row) => {
                      const isRowSelected = row.id === selectedId
                      return (
                        <tr
                          key={row.id}
                          className={isRowSelected ? 'is-row-selected' : ''}
                        >
                          <td>
                            <span className="customer-yt-code-tag">
                              {row.code || '—'}
                            </span>
                          </td>
                          <td>
                            <strong>{row.name}</strong>
                          </td>
                          <td>{row.taxCode || '—'}</td>
                          <td>{row.phone || '—'}</td>
                          <td>{row.address || '—'}</td>
                          <td style={{ textAlign: 'center' }}>
                            {isRowSelected ? (
                              <span className="customer-yt-selected-pill">
                                ✓ Đang chọn
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="ws-button ws-button--secondary ws-button--sm"
                                onClick={() => handleSelect(row)}
                              >
                                Chọn
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Vùng khách hàng đã chọn và thông tin (Vùng riêng phía dưới) */}
      {activeCustomer && (
        <div className="customer-selected-area">
          <div className="customer-yt-selected-card">
            <div className="customer-yt-selected-top">
              <div className="customer-yt-selected-badge">
                <span className="customer-yt-check-icon">✓</span> Khách hàng đã chọn
              </div>
              <strong className="customer-yt-selected-name">{activeCustomer.name}</strong>
              {activeCustomer.code && (
                <span className="customer-yt-code-tag">{activeCustomer.code}</span>
              )}
            </div>
            <div className="customer-yt-selected-details">
              {activeCustomer.taxCode && (
                <span className="customer-yt-detail-item">
                  <span className="customer-yt-detail-label">MST:</span>
                  <strong>{activeCustomer.taxCode}</strong>
                </span>
              )}
              {activeCustomer.phone && (
                <span className="customer-yt-detail-item">
                  <span className="customer-yt-detail-label">SĐT:</span>
                  <a href={`tel:${activeCustomer.phone}`}>{activeCustomer.phone}</a>
                </span>
              )}
              {activeCustomer.email && (
                <span className="customer-yt-detail-item">
                  <span className="customer-yt-detail-label">Email:</span>
                  <a href={`mailto:${activeCustomer.email}`}>{activeCustomer.email}</a>
                </span>
              )}
              {activeCustomer.address && (
                <span className="customer-yt-detail-item">
                  <span className="customer-yt-detail-label">Địa chỉ:</span>
                  <span>{activeCustomer.address}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const RECENT_MODEL_KEY = 'pbl6.recent_model_ids'

function getRecentModelIds(): string[] {
  try {
    const raw = sessionStorage.getItem(RECENT_MODEL_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveRecentModelId(id: string) {
  const list = [id, ...getRecentModelIds().filter((item) => item !== id)].slice(0, 10)
  try {
    sessionStorage.setItem(RECENT_MODEL_KEY, JSON.stringify(list))
  } catch {
    // ignore
  }
  return list
}

export function ModelYouTubePicker({
  selectedId,
  selectedModel,
  onChange,
  onAdd,
  revision = 0,
}: {
  selectedId: string
  selectedModel?: DirectoryRow | null
  onChange: (id: string) => void
  onAdd?: () => void
  revision?: number
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [showResultsTable, setShowResultsTable] = useState(false)
  const [lastExecutedSearch, setLastExecutedSearch] = useState('')
  const [recentIds, setRecentIds] = useState(getRecentModelIds)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch active equipment models
  const modelsQuery = useDirectory<Page<DirectoryRow>>(
    'assetM2',
    '/equipment-models?status=ACTIVE&pageSize=100',
    revision,
  )

  const allModels = useMemo(
    () => modelsQuery.value?.items || [],
    [modelsQuery.value?.items],
  )

  // Determine current selected model info
  const activeModel = useMemo(() => {
    if (selectedModel && selectedModel.id === selectedId) return selectedModel
    if (!selectedId) return null
    return allModels.find((m) => m.id === selectedId) || null
  }, [selectedId, selectedModel, allModels])

  // Get recent models or first 5
  const recentModels = useMemo(() => {
    if (recentIds.length > 0 && allModels.length > 0) {
      const found = recentIds
        .map((id) => allModels.find((m) => m.id === id))
        .filter((m): m is DirectoryRow => Boolean(m))
      if (found.length > 0) return found.slice(0, 5)
    }
    return allModels.slice(0, 5)
  }, [allModels, recentIds])

  // Matching models for autocomplete when typing
  const matchingModels = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return []
    return allModels.filter((m) => {
      const name = (m.name || '').toLowerCase()
      const code = (m.modelCode || m.code || '').toLowerCase()
      const manufacturer = (m.manufacturer || '').toLowerCase()
      const description = (m.description || '').toLowerCase()
      return (
        name.includes(term) ||
        code.includes(term) ||
        manufacturer.includes(term) ||
        description.includes(term)
      )
    })
  }, [allModels, searchTerm])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (m: DirectoryRow) => {
    setRecentIds(saveRecentModelId(m.id))
    onChange(m.id)
    setShowDropdown(false)
    setShowResultsTable(false)
  }

  const handleSearchSubmit = (termToSearch?: string) => {
    const term = (termToSearch !== undefined ? termToSearch : searchTerm).trim()
    setLastExecutedSearch(term)
    setShowResultsTable(true)
    setShowDropdown(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSearchSubmit()
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

  // Filter for table view
  const tableResults = useMemo(() => {
    const term = lastExecutedSearch.toLowerCase()
    if (!term) return allModels
    return allModels.filter((m) => {
      const name = (m.name || '').toLowerCase()
      const code = (m.modelCode || m.code || '').toLowerCase()
      const manufacturer = (m.manufacturer || '').toLowerCase()
      const description = (m.description || '').toLowerCase()
      return (
        name.includes(term) ||
        code.includes(term) ||
        manufacturer.includes(term) ||
        description.includes(term)
      )
    })
  }, [allModels, lastExecutedSearch])

  return (
    <div className="customer-yt-picker" ref={containerRef}>
      {/* Vùng tìm kiếm, thêm model thiết bị (Vùng riêng phía trên) */}
      <div
        className={`customer-search-area ${
          showDropdown ? 'is-dropdown-open' : ''
        }`}
      >
        <label className="customer-yt-label" htmlFor="model-yt-search-input">
          <span>Tìm kiếm model thiết bị</span> <span className="required-star">*</span>
        </label>

        {/* YouTube Search Bar */}
        <div className="customer-yt-toolbar">
          <div className="customer-yt-search-wrapper">
            <div className="customer-yt-search-box">
              <span className="customer-yt-search-icon" aria-hidden="true">
                🔍
              </span>
              <input
                id="model-yt-search-input"
                ref={inputRef}
                type="text"
                className="customer-yt-input"
                placeholder="Tìm theo tên, mã model hoặc hãng sản xuất…"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setShowDropdown(true)
                }}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={handleKeyDown}
                autoComplete="off"
              />
              <button
                type="button"
                className="customer-yt-search-btn"
                onClick={() => handleSearchSubmit()}
                title="Tìm kiếm"
              >
                Tìm
              </button>
            </div>

            {/* Autocomplete Suggestions Dropdown */}
            {showDropdown && (
              <div className="customer-yt-dropdown" role="listbox">
                {!searchTerm.trim() ? (
                  <>
                    {recentModels.length === 0 ? (
                      <div className="customer-yt-empty-item">
                        Chưa có lịch sử model thiết bị
                      </div>
                    ) : (
                      recentModels.map((m) => (
                        <div
                          key={m.id}
                          className={`customer-yt-dropdown-item ${
                            m.id === selectedId ? 'is-selected' : ''
                          }`}
                          onClick={() => handleSelect(m)}
                          role="option"
                          aria-selected={m.id === selectedId}
                        >
                          <span
                            className="customer-yt-item-icon"
                            aria-hidden="true"
                          >
                            🕒
                          </span>
                          <div className="customer-yt-item-info">
                            <div className="customer-yt-item-title">
                              <strong>{m.name}</strong>
                              {(m.modelCode || m.code) && (
                                <span className="customer-yt-code-tag">
                                  {m.modelCode || m.code}
                                </span>
                              )}
                              {m.id === selectedId && (
                                <span className="customer-yt-active-badge">
                                  Đang chọn
                                </span>
                              )}
                            </div>
                            <div className="customer-yt-item-meta">
                              {m.manufacturer && (
                                <span>Hãng: {m.manufacturer}</span>
                              )}
                              {m.description && <span>{m.description}</span>}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </>
                ) : (
                  <>
                    {matchingModels.length === 0 ? (
                      <div className="customer-yt-empty-item">
                        <span>
                          Không tìm thấy model thiết bị nào phù hợp với từ khóa.
                        </span>
                      </div>
                    ) : (
                      matchingModels.slice(0, 8).map((m) => (
                        <div
                          key={m.id}
                          className={`customer-yt-dropdown-item ${
                            m.id === selectedId ? 'is-selected' : ''
                          }`}
                          onClick={() => handleSelect(m)}
                          role="option"
                          aria-selected={m.id === selectedId}
                        >
                          <span
                            className="customer-yt-item-icon"
                            aria-hidden="true"
                          >
                            🔍
                          </span>
                          <div className="customer-yt-item-info">
                            <div className="customer-yt-item-title">
                              <strong>{m.name}</strong>
                              {(m.modelCode || m.code) && (
                                <span className="customer-yt-code-tag">
                                  {m.modelCode || m.code}
                                </span>
                              )}
                              {m.id === selectedId && (
                                <span className="customer-yt-active-badge">
                                  Đang chọn
                                </span>
                              )}
                            </div>
                            <div className="customer-yt-item-meta">
                              {m.manufacturer && (
                                <span>Hãng: {m.manufacturer}</span>
                              )}
                              {m.description && <span>{m.description}</span>}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {onAdd && (
            <button
              type="button"
              className="ws-button ws-button--secondary customer-yt-add-btn"
              onClick={onAdd}
            >
              + Thêm model thiết bị
            </button>
          )}
        </div>

        <LoadState {...modelsQuery} />

        {/* Results Table Panel (When Search button clicked or Enter pressed) */}
        {showResultsTable && (
          <div className="customer-yt-results-panel">
            {tableResults.length === 0 ? (
              <div className="customer-yt-table-empty">
                <p>Không tìm thấy model thiết bị nào phù hợp với từ khóa.</p>
              </div>
            ) : (
              <div className="customer-yt-table-scroll">
                <table className="customer-yt-table">
                  <thead>
                    <tr>
                      <th>Mã model</th>
                      <th>Tên dòng thiết bị</th>
                      <th>Hãng sản xuất</th>
                      <th>Mô tả</th>
                      <th style={{ textAlign: 'center', width: '110px' }}>
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableResults.map((row) => {
                      const isRowSelected = row.id === selectedId
                      return (
                        <tr
                          key={row.id}
                          className={isRowSelected ? 'is-row-selected' : ''}
                        >
                          <td>
                            <span className="customer-yt-code-tag">
                              {row.modelCode || row.code || '—'}
                            </span>
                          </td>
                          <td>
                            <strong>{row.name}</strong>
                          </td>
                          <td>{row.manufacturer || '—'}</td>
                          <td>{row.description || '—'}</td>
                          <td style={{ textAlign: 'center' }}>
                            {isRowSelected ? (
                              <span className="customer-yt-selected-pill">
                                ✓ Đang chọn
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="ws-button ws-button--secondary ws-button--sm"
                                onClick={() => handleSelect(row)}
                              >
                                Chọn
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Vùng model thiết bị đã chọn và thông tin (Vùng riêng phía dưới) */}
      {activeModel && (
        <div className="customer-selected-area">
          <div className="customer-yt-selected-card">
            <div className="customer-yt-selected-top">
              <div className="customer-yt-selected-badge">
                <span className="customer-yt-check-icon">✓</span> Model thiết bị đã chọn
              </div>
              <strong className="customer-yt-selected-name">{activeModel.name}</strong>
              {(activeModel.modelCode || activeModel.code) && (
                <span className="customer-yt-code-tag">
                  {activeModel.modelCode || activeModel.code}
                </span>
              )}
            </div>
            <div className="customer-yt-selected-details">
              {activeModel.manufacturer && (
                <span className="customer-yt-detail-item">
                  <span className="customer-yt-detail-label">Hãng:</span>
                  <strong>{activeModel.manufacturer}</strong>
                </span>
              )}
              {activeModel.description && (
                <span className="customer-yt-detail-item">
                  <span className="customer-yt-detail-label">Mô tả:</span>
                  <span>{activeModel.description}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
