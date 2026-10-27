import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { has } from '../auth/access'
import { useSession } from '../auth/session'
import type { RequestDetail } from '../types/domain'
import { lastDemoRequest } from './demo-request'

const stages = [
  {
    number: '01',
    title: 'Khách hàng xem thiết bị',
    description: 'Xem thiết bị đã bàn giao, số sê-ri và thông tin bảo hành trong phạm vi khách hàng.',
    role: 'Customer User',
    path: '/equipment',
    action: 'Mở danh sách thiết bị',
    allowed: ['CUSTOMER_USER', 'CUSTOMER_ADMIN'],
  },
  {
    number: '02',
    title: 'Tạo yêu cầu sửa chữa',
    description: 'Chọn thiết bị, nhập triệu chứng và gửi yêu cầu. Yêu cầu mới có trạng thái NEW.',
    role: 'Customer User',
    path: '/requests/new',
    action: 'Tạo yêu cầu',
    allowed: ['CUSTOMER_USER', 'CUSTOMER_ADMIN', 'SERVICE_MANAGER'],
  },
  {
    number: '03',
    title: 'Quản lý dịch vụ xem xét',
    description: 'Mở yêu cầu, chọn Xem xét để chụp trạng thái bảo hành, sau đó Tiếp nhận. Trạng thái thành ACCEPTED.',
    role: 'Service Manager',
    path: '/requests',
    action: 'Mở yêu cầu',
    allowed: ['SERVICE_MANAGER'],
  },
  {
    number: '04',
    title: 'Khách hàng theo dõi kết quả',
    description: 'Đăng nhập lại bằng Customer User để xem trạng thái, lịch sử và bình luận của yêu cầu.',
    role: 'Customer User',
    path: '/requests',
    action: 'Xem yêu cầu',
    allowed: ['CUSTOMER_USER', 'CUSTOMER_ADMIN'],
  },
] as const

export default function DemoPage() {
  const { profile } = useSession()
  const tenantId = profile?.tenantId ?? null
  const requestId = lastDemoRequest(tenantId)
  const [request, setRequest] = useState<RequestDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(requestId))

  useEffect(() => {
    if (!requestId) return
    let active = true
    api.requests<RequestDetail>(`/service-requests/${encodeURIComponent(requestId)}`)
      .then((value) => {
        if (active) setRequest(value)
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof ApiError ? cause.message : 'Không thể tải yêu cầu demo.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [requestId])

  if (!profile) return null
  return (
    <div className="demo-page">
      <div className="demo-hero">
        <div>
          <span className="demo-eyebrow">PBL6 · LUỒNG DEMO M1</span>
          <h1>Từ thiết bị đến yêu cầu được tiếp nhận</h1>
          <p>Trình diễn luồng đang hoạt động qua Gateway, với dữ liệu của tenant DEMO và quyền của từng tài khoản.</p>
        </div>
        <div className="demo-current-user">
          <small>Đang đăng nhập</small>
          <strong>{profile.fullName}</strong>
          <span>{profile.roles.join(', ')}</span>
        </div>
      </div>

      <div className="demo-summary">
        <div>
          <small>Yêu cầu vừa tạo trong tab này</small>
          {request ? (
            <Link to={`/requests/${request.id}`}>{request.requestNo} · {request.title}</Link>
          ) : <strong>{loading ? 'Đang tải…' : 'Chưa có yêu cầu'}</strong>}
          {error && <p role="alert">{error}</p>}
        </div>
        <div>
          <small>Trạng thái hiện tại</small>
          <strong>{request?.status ?? '—'}</strong>
        </div>
        <div>
          <small>Kết quả bảo hành</small>
          <strong>{request?.warrantyCheck?.result ?? 'Chưa kiểm tra'}</strong>
        </div>
      </div>

      <div className="demo-heading">
        <h2>Các bước trình diễn</h2>
        <p>Mật khẩu lấy từ <code>SEED_DEMO_PASSWORD</code> trong môi trường local. Đăng xuất để đổi tài khoản giữa các bước.</p>
      </div>
      <div className="demo-steps">
        {stages.map((stage) => {
          const available = has(profile.roles, stage.allowed)
          const path = request && stage.number !== '01' && stage.number !== '02'
            ? `/requests/${request.id}`
            : stage.path
          return (
            <section className="demo-step" key={stage.number}>
              <span className="demo-step-number">{stage.number}</span>
              <div>
                <small>{stage.role}</small>
                <h3>{stage.title}</h3>
                <p>{stage.description}</p>
                {available ? <Link to={path}>{stage.action} →</Link> : <span className="demo-switch">Đăng nhập bằng {stage.role} để thực hiện</span>}
              </div>
            </section>
          )
        })}
      </div>
      <p className="demo-scope">Luồng web hiện kết thúc ở Service Request được tiếp nhận. Work Order, phân công kỹ thuật viên và Service Report sẽ được trình diễn khi các service tương ứng hoàn thiện.</p>
    </div>
  )
}
