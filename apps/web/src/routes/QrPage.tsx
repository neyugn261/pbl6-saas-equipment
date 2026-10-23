import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { creators, has } from '../auth/access'
import { useSession } from '../auth/session'
import type { EquipmentRecord } from '../types/domain'

export default function QrPage() {
  const { token } = useParams()
  const { profile } = useSession()
  const [resolved, setResolved] = useState<{
    token: string
    equipment?: EquipmentRecord
    error?: string
  } | null>(null)
  const loading = resolved?.token !== token
  const equipment = resolved && resolved.token === token ? resolved.equipment : null
  const error = resolved && resolved.token === token ? resolved.error : null

  useEffect(() => {
    let active = true
    if (!token) return
    api
      .asset<EquipmentRecord>(`/qr/${encodeURIComponent(token)}`)
      .then((result) => {
        if (active) setResolved({ token, equipment: result })
      })
      .catch((cause) => {
        if (!active) return
        const message =
          cause instanceof ApiError && cause.status === 404
            ? 'Không tìm thấy thiết bị hoặc bạn không có quyền truy cập.'
            : cause instanceof Error
              ? cause.message
              : 'Không thể mở mã QR.'
        setResolved({ token, error: message })
      })
    return () => {
      active = false
    }
  }, [token])

  return (
    <>
      <header className="m1-header">
        <h1>Thiết bị từ mã QR</h1>
      </header>
      {loading ? (
        <p role="status">Đang kiểm tra mã QR…</p>
      ) : error ? (
        <p className="m1-error" role="alert">
          {error}
        </p>
      ) : (
        equipment && (
          <div className="m1-card">
            <h2>{equipment.assetCode}</h2>
            <p>Số sê-ri: {equipment.serialNumber}</p>
            <p>Trạng thái: {equipment.status}</p>
            <div className="m1-actions">
              <Link className="m1-button" to={`/equipment/${equipment.id}`}>
                Xem thiết bị
              </Link>
              {profile &&
                has(profile.roles, creators) &&
                equipment.status !== 'RETIRED' && (
                  <Link
                    className="m1-button"
                    to={`/requests/new?equipmentId=${encodeURIComponent(equipment.id)}`}
                  >
                    Tạo yêu cầu dịch vụ
                  </Link>
                )}
            </div>
          </div>
        )
      )}
    </>
  )
}
