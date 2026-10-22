import type { Customer, Equipment, Location, MaintenancePlan, Part, ServiceRequest, Technician, Tenant, WorkOrder } from '../types/domain'

export const customers: Customer[] = [
  { id: 'cus-1', code: 'KH-0001', name: 'Công ty Cổ phần Sản xuất Hòa Phát', taxCode: '0401987654', industry: 'Gia công cơ khí chính xác', phone: '0236 388 8668', email: 'baotri@hoaphatdn.vn', address: 'KCN Hòa Khánh, Liên Chiểu, Đà Nẵng', contact: 'Nguyễn Minh Quân' },
  { id: 'cus-2', code: 'KH-0002', name: 'Công ty TNHH Điện tử An Phú', taxCode: '0315882147', industry: 'Sản xuất linh kiện điện tử', phone: '028 3777 2910', email: 'facility@anphu.com.vn', address: 'Khu Công nghệ cao, TP. Thủ Đức, TP.HCM', contact: 'Trần Thu Hà' },
  { id: 'cus-3', code: 'KH-0003', name: 'Nhà máy Bao bì Miền Trung', taxCode: '0402119382', industry: 'Sản xuất bao bì', phone: '0236 369 4200', email: 'kythuat@baobimientrung.vn', address: 'KCN Hòa Cầm, Cẩm Lệ, Đà Nẵng', contact: 'Lê Hoàng Nam' },
]

export const locations: Location[] = [
  { id: 'loc-1', customerId: 'cus-1', name: 'Nhà máy Đà Nẵng', type: 'SITE', address: 'KCN Hòa Khánh, Liên Chiểu, Đà Nẵng' },
  { id: 'loc-2', customerId: 'cus-1', name: 'Xưởng Gia công', type: 'BUILDING', address: 'Nhà máy Đà Nẵng', parentId: 'loc-1' },
  { id: 'loc-3', customerId: 'cus-1', name: 'Khu CNC', type: 'AREA', address: 'Xưởng Gia công · Tầng 1', parentId: 'loc-2' },
  { id: 'loc-4', customerId: 'cus-2', name: 'Nhà máy Thủ Đức', type: 'SITE', address: 'Khu Công nghệ cao, TP. Thủ Đức' },
  { id: 'loc-5', customerId: 'cus-3', name: 'Xưởng In số 2', type: 'AREA', address: 'KCN Hòa Cầm, Đà Nẵng' },
]

export const equipment: Equipment[] = [
  { id: 'eq-1', assetCode: 'EQ-000123', name: 'Máy CNC FANUC Robodrill', model: 'α-D21MiB5 Plus', serial: 'FANUC-26-09382', customerId: 'cus-1', locationId: 'loc-3', status: 'ACTIVE', warranty: 'ACTIVE', warrantyEnd: '15/06/2027', installationDate: '10/06/2025', handoverDate: '15/06/2025', manufacturer: 'FANUC' },
  { id: 'eq-2', assetCode: 'EQ-000124', name: 'Máy nén khí trục vít Atlas Copco', model: 'GA 22 VSD+', serial: 'AC-GA22-88192', customerId: 'cus-1', locationId: 'loc-2', status: 'OUT_OF_SERVICE', warranty: 'EXPIRED', warrantyEnd: '20/03/2026', installationDate: '15/03/2024', handoverDate: '20/03/2024', manufacturer: 'Atlas Copco' },
  { id: 'eq-3', assetCode: 'EQ-000201', name: 'Máy kiểm tra AOI Omron', model: 'VT-S530', serial: 'OMR-530-24089', customerId: 'cus-2', locationId: 'loc-4', status: 'ACTIVE', warranty: 'ACTIVE', warrantyEnd: '02/12/2027', installationDate: '28/11/2025', handoverDate: '02/12/2025', manufacturer: 'Omron' },
  { id: 'eq-4', assetCode: 'EQ-000305', name: 'Máy in Flexo 6 màu', model: 'FX-1200 Pro', serial: 'FX6-2023-0192', customerId: 'cus-3', locationId: 'loc-5', status: 'ACTIVE', warranty: 'EXPIRED', warrantyEnd: '12/08/2025', installationDate: '08/08/2023', handoverDate: '12/08/2023', manufacturer: 'SinoPrint' },
]

export const initialRequests: ServiceRequest[] = [
  { id: 'req-1', number: 'SR-2026-0098', customerId: 'cus-1', equipmentId: 'eq-2', type: 'Sửa chữa', priority: 'URGENT', status: 'PROCESSING', title: 'Máy nén khí báo lỗi nhiệt độ cao', description: 'Máy tự ngắt sau khoảng 20 phút vận hành, màn hình hiển thị mã lỗi E104. Đã kiểm tra thông gió nhưng lỗi vẫn lặp lại.', createdAt: '28/09/2026 · 08:42', contact: 'Nguyễn Minh Quân · 0905 228 910', attachments: 3, estimate: { labor: 1800000, parts: 4250000, other: 350000, status: 'APPROVED' }, timeline: [
    { id: 't1', title: 'Yêu cầu được tạo', description: 'Nguyễn Minh Quân gửi yêu cầu từ Customer Portal', time: '28/09 · 08:42' },
    { id: 't2', title: 'Đã tiếp nhận', description: 'Điều phối viên Lê Anh Tuấn bắt đầu đánh giá', time: '28/09 · 09:15' },
    { id: 't3', title: 'Báo giá được phê duyệt', description: 'Khách hàng đồng ý chi phí 6.400.000 ₫', time: '28/09 · 14:20', tone: 'success' },
    { id: 't4', title: 'Đang xử lý', description: 'Kỹ thuật viên Phạm Quốc Bảo đang thực hiện công việc', time: '29/09 · 08:00', tone: 'warning' },
  ] },
  { id: 'req-2', number: 'SR-2026-0097', customerId: 'cus-2', equipmentId: 'eq-3', type: 'Kiểm tra', priority: 'NORMAL', status: 'REVIEWING', title: 'Kết quả kiểm tra AOI không ổn định', description: 'Tỷ lệ cảnh báo sai tăng ở line số 2 trong ca đêm.', createdAt: '27/09/2026 · 16:10', contact: 'Trần Thu Hà · 0914 722 006', attachments: 1, timeline: [{ id: 't1', title: 'Yêu cầu được tạo', description: 'Trần Thu Hà gửi yêu cầu', time: '27/09 · 16:10' }, { id: 't2', title: 'Đang xem xét', description: 'Bộ phận dịch vụ đang kiểm tra thông tin', time: '28/09 · 08:30', tone: 'warning' }] },
  { id: 'req-3', number: 'SR-2026-0096', customerId: 'cus-1', equipmentId: 'eq-1', type: 'Bảo trì', priority: 'LOW', status: 'RESOLVED', title: 'Bảo trì định kỳ quý III', description: 'Vệ sinh, căn chỉnh trục chính và kiểm tra hệ thống làm mát.', createdAt: '24/09/2026 · 09:00', contact: 'Nguyễn Minh Quân · 0905 228 910', attachments: 2, timeline: [{ id: 't1', title: 'Yêu cầu được tạo', description: 'Tạo từ kế hoạch bảo trì', time: '24/09 · 09:00' }, { id: 't2', title: 'Đã hoàn thành', description: 'Thiết bị vận hành ổn định sau bảo trì', time: '26/09 · 15:45', tone: 'success' }] },
  { id: 'req-4', number: 'SR-2026-0094', customerId: 'cus-3', equipmentId: 'eq-4', type: 'Sửa chữa', priority: 'HIGH', status: 'AWAITING_CUSTOMER_APPROVAL', title: 'Lệch màu tại cụm in số 4', description: 'Màu in lệch khoảng 1.5 mm khi vận hành trên 80 m/phút.', createdAt: '22/09/2026 · 13:25', contact: 'Lê Hoàng Nam · 0905 115 772', attachments: 4, estimate: { labor: 2500000, parts: 7800000, other: 500000, status: 'PENDING' }, timeline: [{ id: 't1', title: 'Yêu cầu được tạo', description: 'Lê Hoàng Nam gửi yêu cầu', time: '22/09 · 13:25' }, { id: 't2', title: 'Chờ duyệt báo giá', description: 'Báo giá đã gửi đến khách hàng', time: '23/09 · 10:15', tone: 'warning' }] },
]

export const initialWorkOrders: WorkOrder[] = [
  { id: 'wo-1', number: 'WO-2026-0064', requestId: 'req-1', technicianId: 'tech-1', scheduledAt: '29/09/2026 · 08:00–12:00', status: 'IN_PROGRESS', priority: 'URGENT', workLog: 'Đã kiểm tra quạt giải nhiệt, phát hiện cảm biến nhiệt sai lệch.', partsUsed: ['Cảm biến nhiệt PT100'] },
  { id: 'wo-2', number: 'WO-2026-0063', requestId: 'req-3', technicianId: 'tech-2', scheduledAt: '26/09/2026 · 13:00–16:00', status: 'COMPLETED', priority: 'LOW', workLog: 'Hoàn tất checklist bảo trì quý III.', partsUsed: ['Dầu bôi trơn Spindle Lube'] },
]

export const technicians: Technician[] = [
  { id: 'tech-1', name: 'Phạm Quốc Bảo', branch: 'Chi nhánh Đà Nẵng', skills: ['Máy nén khí', 'Điện công nghiệp'], availability: 'BUSY', workload: 3, phone: '0905 234 118' },
  { id: 'tech-2', name: 'Võ Thành Công', branch: 'Chi nhánh Đà Nẵng', skills: ['CNC', 'Cơ khí chính xác'], availability: 'AVAILABLE', workload: 1, phone: '0905 711 029' },
  { id: 'tech-3', name: 'Nguyễn Hoàng Lâm', branch: 'Chi nhánh TP.HCM', skills: ['AOI', 'Điện tử'], availability: 'AVAILABLE', workload: 2, phone: '0918 440 236' },
  { id: 'tech-4', name: 'Đặng Minh Trí', branch: 'Chi nhánh Đà Nẵng', skills: ['Máy in', 'PLC'], availability: 'OFF', workload: 0, phone: '0903 881 642' },
]

export const parts: Part[] = [
  { id: 'part-1', code: 'PT-00142', name: 'Cảm biến nhiệt PT100', category: 'Cảm biến', unit: 'Cái', stock: 4, minimum: 5, warehouse: 'Kho Đà Nẵng' },
  { id: 'part-2', code: 'PT-00089', name: 'Lọc dầu Atlas Copco 1625', category: 'Bộ lọc', unit: 'Cái', stock: 12, minimum: 4, warehouse: 'Kho Đà Nẵng' },
  { id: 'part-3', code: 'PT-00201', name: 'Dầu bôi trơn Spindle Lube', category: 'Dầu kỹ thuật', unit: 'Can 5L', stock: 3, minimum: 3, warehouse: 'Kho Đà Nẵng' },
  { id: 'part-4', code: 'PT-00315', name: 'Camera AOI 12MP', category: 'Linh kiện điện tử', unit: 'Cái', stock: 2, minimum: 1, warehouse: 'Kho TP.HCM' },
]

export const maintenancePlans: MaintenancePlan[] = [
  { id: 'mp-1', equipmentId: 'eq-1', frequency: 'Mỗi 3 tháng', lastDate: '26/09/2026', nextDate: '26/12/2026', status: 'ACTIVE' },
  { id: 'mp-2', equipmentId: 'eq-3', frequency: 'Mỗi 6 tháng', lastDate: '05/05/2026', nextDate: '05/11/2026', status: 'UPCOMING' },
  { id: 'mp-3', equipmentId: 'eq-4', frequency: 'Mỗi 3 tháng', lastDate: '12/05/2026', nextDate: '12/08/2026', status: 'OVERDUE' },
]

export const tenants: Tenant[] = [
  { id: 'ten-1', code: 'TNT-ABC', name: 'Công ty TNHH Thiết bị Kỹ thuật An Tín', status: 'ACTIVE', admin: 'Trần Quốc Huy', users: 34, customers: 128, equipment: 486, createdAt: '12/01/2025' },
  { id: 'ten-2', code: 'TNT-MTE', name: 'Công ty Cổ phần Máy Công nghiệp Miền Trung', status: 'ACTIVE', admin: 'Nguyễn Thanh Sơn', users: 21, customers: 76, equipment: 291, createdAt: '20/03/2025' },
  { id: 'ten-3', code: 'TNT-VPS', name: 'Công ty TNHH Giải pháp Kỹ thuật Việt Phát', status: 'SUSPENDED', admin: 'Lê Kim Oanh', users: 12, customers: 39, equipment: 108, createdAt: '08/08/2025' },
]
