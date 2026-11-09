// One fixture catalogue for all development seeds. No passwords or runtime tokens.
const id = (suffix) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const tenant = { id: id(1), code: "DEMO", name: "Công ty Thiết bị Demo" };
const users = [
  ["platform.admin@pbl6.local", "Quản trị nền tảng", "PLATFORM_ADMIN"],
  ["tenant.admin@demo.local", "Quản trị Công ty Thiết bị Demo", "TENANT_ADMIN"],
  [
    "service.manager@demo.local",
    "Nguyễn Minh Anh — Dịch vụ HCM",
    "SERVICE_MANAGER",
    301,
  ],
  [
    "service.manager.dn@demo.local",
    "Trần Hải Nam — Dịch vụ Đà Nẵng",
    "SERVICE_MANAGER",
    302,
  ],
  ["inventory@demo.local", "Lê Thu Hà — Kho HCM", "INVENTORY_STAFF", 301],
  [
    "inventory.dn@demo.local",
    "Võ Thanh Sơn — Kho Đà Nẵng",
    "INVENTORY_STAFF",
    302,
  ],
  [
    "technician@demo.local",
    "Phạm Quốc Huy — Kỹ thuật HCM 01",
    "TECHNICIAN",
    301,
  ],
  [
    "technician.hcm02@demo.local",
    "Nguyễn Thảo Vy — Kỹ thuật HCM 02",
    "TECHNICIAN",
    301,
  ],
  [
    "technician.dn01@demo.local",
    "Trần Đức Minh — Kỹ thuật Đà Nẵng 01",
    "TECHNICIAN",
    302,
  ],
  [
    "technician.dn02@demo.local",
    "Lê Hoàng Phúc — Kỹ thuật Đà Nẵng 02",
    "TECHNICIAN",
    302,
  ],
  [
    "customer.admin@demo.local",
    "Nguyễn Văn An — Bệnh viện Demo",
    "CUSTOMER_ADMIN",
    null,
    101,
    201,
  ],
  [
    "customer.user@demo.local",
    "Trần Ngọc Mai — Bệnh viện Demo",
    "CUSTOMER_USER",
    null,
    101,
    202,
  ],
  [
    "factory.admin@demo.local",
    "Trần Thị Bình — Nhà máy Demo",
    "CUSTOMER_ADMIN",
    null,
    102,
    203,
  ],
  [
    "factory.user@demo.local",
    "Lê Văn Thành — Nhà máy Demo",
    "CUSTOMER_USER",
    null,
    102,
    204,
  ],
].map(([email, fullName, role, branch, customer, membership]) => ({
  email,
  fullName,
  role,
  userType:
    role === "PLATFORM_ADMIN"
      ? "PLATFORM_STAFF"
      : role.startsWith("CUSTOMER_")
        ? "CUSTOMER"
        : "TENANT_STAFF",
  branchId: branch ? id(branch) : null,
  customerId: customer ? id(customer) : null,
  membershipId: membership ? id(membership) : null,
}));
const branches = [
  {
    id: id(301),
    code: "HCM",
    name: "Chi nhánh Hồ Chí Minh",
    address: "12 Nguyễn Huệ, TP. Hồ Chí Minh",
    phone: "028 3822 0001",
  },
  {
    id: id(302),
    code: "DN",
    name: "Chi nhánh Đà Nẵng",
    address: "45 Bạch Đằng, Đà Nẵng",
    phone: "0236 382 0002",
  },
];
const customers = [
  {
    id: id(101),
    code: "DEMO-CUST-01",
    name: "Bệnh viện Đa khoa Demo",
    taxCode: "0301234567",
    email: "contact@hospital.demo.local",
    address: "201 Nguyễn Chí Thanh, TP. Hồ Chí Minh",
  },
  {
    id: id(102),
    code: "DEMO-CUST-02",
    name: "Nhà máy Cơ khí Demo",
    taxCode: "0401234567",
    email: "contact@factory.demo.local",
    address: "KCN Hòa Khánh, Đà Nẵng",
  },
];
const sites = [
  {
    id: id(401),
    customerId: id(101),
    code: "DEMO-SITE-01",
    name: "Bệnh viện — Cơ sở HCM",
    address: "201 Nguyễn Chí Thanh, TP. Hồ Chí Minh",
    defaultServicingBranchId: id(301),
  },
  {
    id: id(402),
    customerId: id(101),
    code: "DEMO-SITE-02",
    name: "Bệnh viện — Cơ sở Đà Nẵng",
    address: "124 Hải Phòng, Đà Nẵng",
    defaultServicingBranchId: id(302),
  },
  {
    id: id(403),
    customerId: id(102),
    code: "DEMO-SITE-03",
    name: "Nhà máy — Xưởng Đà Nẵng",
    address: "KCN Hòa Khánh, Đà Nẵng",
    defaultServicingBranchId: id(302),
  },
  {
    id: id(404),
    customerId: id(102),
    code: "DEMO-SITE-04",
    name: "Nhà máy — Xưởng HCM",
    address: "KCN Tân Bình, TP. Hồ Chí Minh",
    defaultServicingBranchId: id(301),
  },
];
const locations = sites.flatMap((site, i) => [
  {
    id: id(501 + i * 2),
    customerSiteId: site.id,
    code: "KHU-KT",
    name: "Khu kỹ thuật",
    type: "AREA",
    parentId: null,
  },
  {
    id: id(502 + i * 2),
    customerSiteId: site.id,
    code: "PHONG-VH",
    name: "Phòng vận hành",
    type: "ROOM",
    parentId: id(501 + i * 2),
  },
]);
const contacts = [
  {
    id: id(601),
    customerId: id(101),
    customerSiteId: id(401),
    name: "Nguyễn Văn An",
    email: "an.nguyen@hospital.demo.local",
    phone: "0901 000 001",
    position: "Trưởng phòng Vật tư",
    isPrimary: true,
  },
  {
    id: id(602),
    customerId: id(101),
    customerSiteId: id(402),
    name: "Trần Ngọc Mai",
    email: "mai.tran@hospital.demo.local",
    phone: "0901 000 002",
    position: "Phụ trách thiết bị",
    isPrimary: false,
  },
  {
    id: id(603),
    customerId: id(102),
    customerSiteId: id(403),
    name: "Trần Thị Bình",
    email: "binh.tran@factory.demo.local",
    phone: "0902 000 001",
    position: "Quản đốc",
    isPrimary: true,
  },
  {
    id: id(604),
    customerId: id(102),
    customerSiteId: id(404),
    name: "Lê Văn Thành",
    email: "thanh.le@factory.demo.local",
    phone: "0902 000 002",
    position: "Phụ trách bảo trì",
    isPrimary: false,
  },
];
const models = [
  {
    id: id(1001),
    manufacturer: "Demo Medical",
    modelCode: "US-100",
    name: "Máy siêu âm Demo",
  },
  {
    id: id(1002),
    manufacturer: "Demo Industrial",
    modelCode: "PUMP-200",
    name: "Máy bơm Demo",
  },
];
const equipment = [
  [1101, 1001, 101, 401, 502, "US-100-001", "CURRENT"],
  [1102, 1001, 101, 402, 504, "US-100-002", "EXPIRED"],
  [1103, 1002, 102, 403, 506, "PUMP-200-001", "NONE"],
  [1104, 1002, 102, 404, 508, "PUMP-200-002", "CURRENT"],
  [1105, 1001, 101, 401, 502, "US-100-003", "CURRENT"],
  [1106, 1002, 102, 403, 506, "PUMP-200-003", "CURRENT"],
].map(([suffix, model, customer, site, location, serialNumber, warranty]) => ({
  id: id(suffix),
  modelId: id(model),
  customerId: id(customer),
  customerSiteId: id(site),
  locationId: id(location),
  assetCode: "DEMO-ASSET-" + String(suffix - 1100).padStart(2, "0"),
  serialNumber,
  warranty,
}));
const skills = [
  { id: id(4101), code: "DEMO-DIAGNOSTICS", name: "Chẩn đoán thiết bị" },
  { id: id(4102), code: "DEMO-MAINTENANCE", name: "Bảo trì thiết bị" },
  { id: id(4103), code: "DEMO-REPAIR", name: "Sửa chữa điện và cơ khí" },
];
const technicians = users
  .filter((u) => u.role === "TECHNICIAN")
  .map((u, i) => ({
    id: id(4001 + i),
    email: u.email,
    branchId: u.branchId,
    employeeCode:
      i === 0 ? "DEMO-TECH-01" : "DEMO-TECH-" + String(i + 1).padStart(2, "0"),
  }));
const parts = [
  {
    id: id(5001),
    sku: "DEMO-FILTER-01",
    name: "Bộ lọc thiết bị",
    unit: "cái",
    minimum: "5.00",
  },
  {
    id: id(5002),
    sku: "DEMO-FUSE-01",
    name: "Cầu chì bảo vệ",
    unit: "cái",
    minimum: "5.00",
  },
  {
    id: id(5003),
    sku: "DEMO-SENSOR-01",
    name: "Cảm biến áp suất",
    unit: "cái",
    minimum: "3.00",
  },
];
const warehouses = [
  {
    id: id(5101),
    code: "DEMO-HCM-STORE",
    name: "Kho phụ tùng HCM",
    branchId: id(301),
    email: "inventory@demo.local",
    receipts: ["14.00", "20.00", "0.00"],
  },
  {
    id: id(5102),
    code: "DEMO-DN-STORE",
    name: "Kho phụ tùng Đà Nẵng",
    branchId: id(302),
    email: "inventory.dn@demo.local",
    receipts: ["8.00", "3.00", "6.00"],
  },
];
const plans = [
  {
    id: id(3001),
    equipmentId: id(1105),
    name: "DEMO-MAINTENANCE-01: Kiểm tra máy siêu âm HCM",
    branch: "HCM",
  },
  {
    id: id(3002),
    equipmentId: id(1103),
    name: "DEMO-MAINTENANCE-02: Bảo trì máy bơm Đà Nẵng",
    branch: "DN",
  },
];
const cases = [
  {
    key: "DEMO-HCM-NEW",
    equipmentId: id(1101),
    branch: "HCM",
    target: "NEW",
    title: "DEMO-HCM-NEW — Máy siêu âm hiển thị nhiễu",
  },
  {
    key: "DEMO-HCM-INPROGRESS",
    equipmentId: id(1104),
    branch: "HCM",
    target: "IN_PROGRESS",
    title: "DEMO-HCM-INPROGRESS — Máy bơm hoạt động không ổn định",
  },
  {
    key: "DEMO-HCM-CLOSED",
    equipmentId: id(1105),
    branch: "HCM",
    target: "CLOSED",
    title: "DEMO-HCM-CLOSED — Đã khắc phục lỗi nguồn máy siêu âm",
  },
  {
    key: "DEMO-DN-NEW",
    equipmentId: id(1106),
    branch: "DN",
    target: "NEW",
    title: "DEMO-DN-NEW — Máy bơm phát tiếng ồn bất thường",
  },
  {
    key: "DEMO-DN-ESTIMATE",
    equipmentId: id(1102),
    branch: "DN",
    target: "ESTIMATE",
    title: "DEMO-DN-ESTIMATE — Máy hết bảo hành, chờ duyệt chi phí",
  },
  {
    key: "DEMO-DN-CLOSED",
    equipmentId: id(1103),
    branch: "DN",
    target: "CLOSED",
    title: "DEMO-DN-CLOSED — Đã thay cầu chì máy không có bảo hành",
  },
];
function dateOffset(base, days) {
  return new Date(Date.parse(base + "T00:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
module.exports = {
  id,
  tenant,
  users,
  branches,
  customers,
  sites,
  locations,
  contacts,
  models,
  equipment,
  skills,
  technicians,
  parts,
  warehouses,
  plans,
  cases,
  dateOffset,
};
