import { Wrench } from 'lucide-react'

export default function AuthStory() {
  return <aside className="login-story">
    <div className="login-story__brand">
      <span><Wrench size={22} /></span>
      <strong>Servio</strong>
    </div>
    <div>
      <span className="m1-eyebrow">NỀN TẢNG DỊCH VỤ SAU BÁN HÀNG</span>
      <h2>Dịch vụ thiết bị, theo dõi từ yêu cầu đến hoàn tất.</h2>
      <p>Quản lý bảo hành, bảo trì và điều phối kỹ thuật trong một quy trình rõ ràng.</p>
    </div>
    <small>PBL6 · Quản lý dịch vụ thiết bị</small>
  </aside>
}
