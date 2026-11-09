// One fixture catalogue for all development seeds. No passwords or runtime tokens.
const id = (suffix) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const tenant = { id: id(1), code: "MP", name: "Công ty Thiết bị Minh Phát" };
const users = [
  ["platform.admin@pbl6.local", "Đặng Tuấn Kiệt", "PLATFORM_ADMIN"],
  ["tenant.admin@demo.local", "Lê Quốc Bảo", "TENANT_ADMIN"],
  ["service.manager@demo.local", "Nguyễn Minh Anh", "SERVICE_MANAGER", 301],
  ["service.manager.dn@demo.local", "Trần Hải Nam", "SERVICE_MANAGER", 302],
  ["inventory@demo.local", "Lê Thu Hà", "INVENTORY_STAFF", 301],
  ["inventory.dn@demo.local", "Võ Thanh Sơn", "INVENTORY_STAFF", 302],
  ["technician@demo.local", "Phạm Quốc Huy", "TECHNICIAN", 301],
  ["technician.hcm02@demo.local", "Nguyễn Thảo Vy", "TECHNICIAN", 301],
  ["technician.dn01@demo.local", "Trần Đức Minh", "TECHNICIAN", 302],
  ["technician.dn02@demo.local", "Lê Hoàng Phúc", "TECHNICIAN", 302],
  [
    "customer.admin@demo.local",
    "Nguyễn Văn An",
    "CUSTOMER_ADMIN",
    null,
    101,
    201,
  ],
  [
    "customer.user@demo.local",
    "Trần Ngọc Mai",
    "CUSTOMER_USER",
    null,
    101,
    202,
  ],
  [
    "factory.admin@demo.local",
    "Trần Thị Bình",
    "CUSTOMER_ADMIN",
    null,
    102,
    203,
  ],
  ["factory.user@demo.local", "Lê Văn Thành", "CUSTOMER_USER", null, 102, 204],
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
    code: "BV-AP",
    name: "Bệnh viện Đa khoa An Phúc",
    taxCode: "0301234567",
    email: "info@anphuc.example",
    address: "201 Nguyễn Chí Thanh, TP. Hồ Chí Minh",
  },
  {
    id: id(102),
    code: "CK-HL",
    name: "Công ty Cơ khí Hòa Long",
    taxCode: "0401234567",
    email: "contact@hoalong.example",
    address: "KCN Hòa Khánh, Đà Nẵng",
  },
];
const sites = [
  {
    id: id(401),
    customerId: id(101),
    code: "AP-HCM",
    name: "An Phúc - HCM",
    address: "201 Nguyễn Chí Thanh, TP. Hồ Chí Minh",
    defaultServicingBranchId: id(301),
  },
  {
    id: id(402),
    customerId: id(101),
    code: "AP-DN",
    name: "An Phúc - Đà Nẵng",
    address: "124 Hải Phòng, Đà Nẵng",
    defaultServicingBranchId: id(302),
  },
  {
    id: id(403),
    customerId: id(102),
    code: "HL-DN",
    name: "Xưởng Hòa Khánh",
    address: "KCN Hòa Khánh, Đà Nẵng",
    defaultServicingBranchId: id(302),
  },
  {
    id: id(404),
    customerId: id(102),
    code: "HL-HCM",
    name: "Xưởng Tân Bình",
    address: "KCN Tân Bình, TP. Hồ Chí Minh",
    defaultServicingBranchId: id(301),
  },
];
const locations = sites.flatMap((site, i) => [
  {
    id: id(501 + i * 2),
    customerSiteId: site.id,
    code: "KT",
    name: "Khu kỹ thuật",
    type: "AREA",
    parentId: null,
  },
  {
    id: id(502 + i * 2),
    customerSiteId: site.id,
    code: "VH",
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
    email: "an.nguyen@anphuc.example",
    phone: "0901 000 001",
    position: "Trưởng phòng Vật tư",
    isPrimary: true,
  },
  {
    id: id(602),
    customerId: id(101),
    customerSiteId: id(402),
    name: "Trần Ngọc Mai",
    email: "mai.tran@anphuc.example",
    phone: "0901 000 002",
    position: "Phụ trách thiết bị",
    isPrimary: false,
  },
  {
    id: id(603),
    customerId: id(102),
    customerSiteId: id(403),
    name: "Trần Thị Bình",
    email: "binh.tran@hoalong.example",
    phone: "0902 000 001",
    position: "Quản đốc",
    isPrimary: true,
  },
  {
    id: id(604),
    customerId: id(102),
    customerSiteId: id(404),
    name: "Lê Văn Thành",
    email: "thanh.le@hoalong.example",
    phone: "0902 000 002",
    position: "Phụ trách bảo trì",
    isPrimary: false,
  },
];
const models = [
  {
    id: id(1001),
    manufacturer: "Mediviet",
    modelCode: "US-100",
    name: "Máy siêu âm US-100",
  },
  {
    id: id(1002),
    manufacturer: "VinaPump",
    modelCode: "PUMP-200",
    name: "Máy bơm PUMP-200",
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
  assetCode: (model === 1001 ? "SA-" : "MB-") + serialNumber.slice(-3),
  serialNumber,
  warranty,
}));
const skills = [
  { id: id(4101), code: "CD", name: "Chẩn đoán thiết bị" },
  { id: id(4102), code: "BT", name: "Bảo trì thiết bị" },
  { id: id(4103), code: "SC", name: "Sửa chữa điện và cơ khí" },
];
const technicians = users
  .filter((u) => u.role === "TECHNICIAN")
  .map((u, i) => ({
    id: id(4001 + i),
    email: u.email,
    branchId: u.branchId,
    employeeCode: "KT" + String(i + 1).padStart(3, "0"),
  }));
const parts = [
  {
    id: id(5001),
    sku: "LOC-01",
    name: "Lõi lọc thiết bị",
    unit: "cái",
    minimum: "5.00",
  },
  {
    id: id(5002),
    sku: "CC-5A",
    name: "Cầu chì 5A",
    unit: "cái",
    minimum: "5.00",
  },
  {
    id: id(5003),
    sku: "CB-AS01",
    name: "Cảm biến áp suất",
    unit: "cái",
    minimum: "3.00",
  },
];
const warehouses = [
  {
    id: id(5101),
    code: "K-HCM",
    name: "Kho HCM",
    branchId: id(301),
    email: "inventory@demo.local",
    receipts: ["14.00", "20.00", "0.00"],
  },
  {
    id: id(5102),
    code: "K-DN",
    name: "Kho Đà Nẵng",
    branchId: id(302),
    email: "inventory.dn@demo.local",
    receipts: ["8.00", "3.00", "6.00"],
  },
];
const plans = [
  {
    id: id(3001),
    equipmentId: id(1105),
    name: "Bảo trì máy siêu âm SA-003",
    branch: "HCM",
  },
  {
    id: id(3002),
    equipmentId: id(1103),
    name: "Bảo trì máy bơm MB-001",
    branch: "DN",
  },
];
// Keep scenario keys stable across label updates; only titles/descriptions are stored as business text.
const cases = [
  {
    key: "DEMO-HCM-NEW",
    equipmentId: id(1101),
    branch: "HCM",
    target: "NEW",
    title: "Hình ảnh siêu âm bị nhiễu",
    description:
      "Hình ảnh xuất hiện sọc khi kiểm tra đầu dò. Đề nghị kiểm tra tín hiệu và nguồn cấp.",
  },
  {
    key: "DEMO-HCM-INPROGRESS",
    equipmentId: id(1104),
    branch: "HCM",
    target: "IN_PROGRESS",
    title: "Áp suất bơm không ổn định",
    description:
      "Áp suất đầu ra dao động khi máy vận hành liên tục, lưu lượng giảm so với bình thường.",
  },
  {
    key: "DEMO-HCM-CLOSED",
    equipmentId: id(1105),
    branch: "HCM",
    target: "CLOSED",
    title: "Máy siêu âm không lên nguồn",
    description:
      "Máy không khởi động khi bật công tắc. Đèn báo nguồn chập chờn trước khi ngừng hoạt động.",
  },
  {
    key: "DEMO-DN-NEW",
    equipmentId: id(1106),
    branch: "DN",
    target: "NEW",
    title: "Máy bơm phát tiếng ồn",
    description:
      "Máy phát tiếng ồn và rung khi chạy tải, cần kiểm tra ổ bi và cụm truyền động.",
  },
  {
    key: "DEMO-DN-ESTIMATE",
    equipmentId: id(1102),
    branch: "DN",
    target: "ESTIMATE",
    title: "Máy siêu âm khởi động chậm",
    description:
      "Máy mất nhiều thời gian khởi động và tự khởi động lại khi chuyển chế độ đo.",
  },
  {
    key: "DEMO-DN-CLOSED",
    equipmentId: id(1103),
    branch: "DN",
    target: "CLOSED",
    title: "Máy bơm mất nguồn",
    description:
      "Máy bơm ngừng hoạt động, tủ điện vẫn có nguồn nhưng đèn báo thiết bị không sáng.",
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
