import { AlertCircle, ChevronDown, ChevronLeft, ChevronRight, Inbox, LoaderCircle, Search, X } from 'lucide-react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' }) {
  return <button className={`button button--${variant} button--${size} ${className}`} {...props} />
}

export function IconButton({ label, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return <button className="icon-button" aria-label={label} title={label} {...props}>{children}</button>
}

export function SearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <label className="search-input"><Search size={17} aria-hidden="true" /><input aria-label="Tìm kiếm" {...props} /></label>
}

export function Select({ children, label, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return <label className="select-wrap">{label && <span className="sr-only">{label}</span>}<select aria-label={label} {...props}>{children}</select><ChevronDown size={15} /></label>
}

const statusLabels: Record<string, string> = {
  NEW: 'Mới', REVIEWING: 'Đang xem xét', AWAITING_CUSTOMER_APPROVAL: 'Chờ khách hàng duyệt', ACCEPTED: 'Đã tiếp nhận', PROCESSING: 'Đang xử lý', RESOLVED: 'Đã xử lý', CLOSED: 'Đã đóng', REQUEST_REJECTED: 'Từ chối yêu cầu', COST_REJECTED: 'Từ chối báo giá', CANCELLED: 'Đã hủy', CREATED: 'Đã tạo', ASSIGNED: 'Đã phân công', IN_PROGRESS: 'Đang thực hiện', ON_HOLD: 'Tạm dừng', COMPLETED: 'Hoàn thành', ACTIVE: 'Hoạt động', OUT_OF_SERVICE: 'Ngừng hoạt động', RETIRED: 'Ngừng sử dụng', EXPIRED: 'Hết hạn', AVAILABLE: 'Sẵn sàng', BUSY: 'Đang bận', OFF: 'Ngoài ca', UPCOMING: 'Sắp đến hạn', OVERDUE: 'Quá hạn', SUSPENDED: 'Tạm khóa', PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối',
}
const positive = ['ACTIVE', 'AVAILABLE', 'COMPLETED', 'RESOLVED', 'CLOSED', 'APPROVED', 'ACCEPTED']
const warning = ['REVIEWING', 'AWAITING_CUSTOMER_APPROVAL', 'ASSIGNED', 'PROCESSING', 'IN_PROGRESS', 'BUSY', 'UPCOMING', 'PENDING', 'ON_HOLD']
const negative = ['EXPIRED', 'OUT_OF_SERVICE', 'CANCELLED', 'REJECTED', 'REQUEST_REJECTED', 'COST_REJECTED', 'OVERDUE', 'SUSPENDED']
export function StatusBadge({ status }: { status: string }) {
  const tone = positive.includes(status) ? 'positive' : warning.includes(status) ? 'warning' : negative.includes(status) ? 'negative' : 'neutral'
  return <span className={`badge badge--${tone}`}><span className="badge__dot" />{statusLabels[status] ?? status}</span>
}

const priorityLabels = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', URGENT: 'Khẩn cấp' }
export function PriorityBadge({ priority }: { priority: keyof typeof priorityLabels }) {
  return <span className={`priority priority--${priority.toLowerCase()}`}>{priorityLabels[priority]}</span>
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-header__actions">{actions}</div>}</div>
}

export function Section({ title, description, actions, children, className = '' }: { title?: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`section ${className}`}>{(title || actions) && <header className="section__header"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{actions}</header>}<div className="section__content">{children}</div></section>
}

export function MetricCard({ label, value, detail, icon, tone = 'blue' }: { label: string; value: string | number; detail: string; icon: ReactNode; tone?: 'blue' | 'green' | 'amber' | 'violet' }) {
  return <article className="metric-card"><div className={`metric-card__icon metric-card__icon--${tone}`}>{icon}</div><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>
}

export function InfoGrid({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return <dl className="info-grid">{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="table-scroll"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
}

export function Pagination({ total = 24 }: { total?: number }) {
  return <div className="pagination"><p>Hiển thị <strong>1–{Math.min(10, total)}</strong> trong {total}</p><div><IconButton label="Trang trước" disabled><ChevronLeft size={17} /></IconButton><button className="page-number active">1</button>{total > 10 && <button className="page-number">2</button>}<IconButton label="Trang sau"><ChevronRight size={17} /></IconButton></div></div>
}

export function EmptyState({ title = 'Chưa có dữ liệu', description = 'Dữ liệu sẽ xuất hiện tại đây khi được tạo.', action }: { title?: string; description?: string; action?: ReactNode }) {
  return <div className="state"><div className="state__icon"><Inbox /></div><h3>{title}</h3><p>{description}</p>{action}</div>
}
export function ErrorState() { return <div className="state"><div className="state__icon state__icon--error"><AlertCircle /></div><h3>Không thể tải dữ liệu</h3><p>Vui lòng thử lại hoặc liên hệ quản trị viên nếu lỗi vẫn tiếp diễn.</p><Button variant="secondary">Thử lại</Button></div> }
export function LoadingState() { return <div className="skeleton-list" aria-label="Đang tải"><LoaderCircle className="spin" /><div /><div /><div /></div> }

export function Tabs({ items, active, onChange }: { items: Array<{ id: string; label: string; count?: number }>; active: string; onChange: (id: string) => void }) {
  return <div className="tabs" role="tablist">{items.map((item) => <button key={item.id} role="tab" aria-selected={active === item.id} className={active === item.id ? 'active' : ''} onClick={() => onChange(item.id)}>{item.label}{item.count !== undefined && <span>{item.count}</span>}</button>)}</div>
}

export function Field({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: ReactNode }) {
  return <label className={`field ${error ? 'field--error' : ''}`}><span>{label}{required && <b> *</b>}</span>{children}{error ? <small>{error}</small> : hint && <small>{hint}</small>}</label>
}

export function Dialog({ open, title, description, children, onClose }: { open: boolean; title: string; description?: string; children: ReactNode; onClose: () => void }) {
  if (!open) return null
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header><div><h2 id="dialog-title">{title}</h2>{description && <p>{description}</p>}</div><IconButton label="Đóng" onClick={onClose}><X size={19} /></IconButton></header>{children}</div></div>
}

export function ActivityTimeline({ events }: { events: Array<{ id: string; title: string; description: string; time: string; tone?: string }> }) {
  return <ol className="timeline">{events.map((event) => <li key={event.id} className={event.tone ? `timeline--${event.tone}` : ''}><span className="timeline__marker" /><div><strong>{event.title}</strong><p>{event.description}</p><time>{event.time}</time></div></li>)}</ol>
}

export function Currency({ value }: { value: number }) { return <>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)}</> }
