// Development fixture upgrade: each call uses only the owning service's DB.
// Match the previous labels exactly so operator edits and business progress survive.
const catalog = require("./catalog.cjs");
const legacy = require("./legacy-labels.json");

async function renameRows(db, model, oldRows, newRows, fields, scope) {
  for (const previous of oldRows) {
    const current = newRows.find((row) => row.id === previous.id);
    if (!current) continue;
    for (const field of fields) {
      if (previous[field] === current[field]) continue;
      await db[model].updateMany({
        where: { ...scope, id: previous.id, [field]: previous[field] },
        data: { [field]: current[field] },
      });
    }
  }
}
const oldDescription =
  "Bộ dữ liệu demo: kiểm tra thiết bị, đánh giá bảo hành và xử lý theo chi nhánh phục vụ.";
const oldLogs = [
  "DEMO: Đã kiểm tra và xác nhận hiện tượng tại thiết bị.",
  "DEMO: Đã thống nhất phương án xử lý với khách hàng.",
];
const logs = oldLogs.map((note) => note.replace("DEMO: ", ""));
const textChanges = [];
for (const group of [
  "users",
  "customers",
  "sites",
  "models",
  "equipment",
  "skills",
  "technicians",
  "parts",
  "warehouses",
  "plans",
  "cases",
]) {
  for (const [i, row] of legacy[group].entries()) {
    const current = catalog[group][i];
    for (const field of [
      "fullName",
      "code",
      "name",
      "assetCode",
      "employeeCode",
      "sku",
      "title",
    ]) {
      if (typeof row[field] === "string" && row[field] !== current[field])
        textChanges.push([row[field], current[field]]);
    }
  }
}
textChanges.push([legacy.tenant.name, catalog.tenant.name]);
textChanges.sort((a, b) => b[0].length - a[0].length);
function renameText(value) {
  if (typeof value === "string") {
    for (const [before, after] of textChanges)
      value = value.split(before).join(after);
    return value;
  }
  if (Array.isArray(value)) return value.map(renameText);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, renameText(item)]),
    );
  return value;
}
async function refreshOwnedLabels(db, service) {
  const tenantId = catalog.tenant.id,
    scope = { tenantId };
  if (service === "identity") {
    await db.tenantDirectory.updateMany({
      where: { tenantId, code: legacy.tenant.code },
      data: { code: catalog.tenant.code },
    });
    for (const old of legacy.users) {
      const current = catalog.users.find((user) => user.email === old.email);
      await db.user.updateMany({
        where: {
          email: old.email,
          tenantId: old.userType === "PLATFORM_STAFF" ? null : tenantId,
          fullName: old.fullName,
        },
        data: { fullName: current.fullName },
      });
    }
  }
  if (service === "organization") {
    for (const field of ["code", "name"])
      await db.tenant.updateMany({
        where: { id: tenantId, [field]: legacy.tenant[field] },
        data: { [field]: catalog.tenant[field] },
      });
    for (const [model, group, fields] of [
      ["customer", "customers", ["code", "name", "email"]],
      ["customerSite", "sites", ["code", "name"]],
      ["location", "locations", ["code", "name"]],
      ["customerContact", "contacts", ["name", "email"]],
    ])
      await renameRows(db, model, legacy[group], catalog[group], fields, scope);
  }
  if (service === "asset") {
    await renameRows(
      db,
      "equipmentModel",
      legacy.models,
      catalog.models,
      ["manufacturer", "name"],
      scope,
    );
    await renameRows(
      db,
      "equipment",
      legacy.equipment,
      catalog.equipment,
      ["assetCode"],
      scope,
    );
    for (const [i, equipment] of catalog.equipment.entries())
      await db.equipmentHistory.updateMany({
        where: {
          tenantId,
          id: catalog.id(1301 + i),
          equipmentId: equipment.id,
          eventType: "REGISTERED",
          description: "Thiết bị bàn giao trong bộ demo hai chi nhánh",
        },
        data: { description: "Ghi nhận bàn giao thiết bị cho khách hàng." },
      });
    // Published policy bodies, applied snapshots and audit payloads stay immutable.
    // The seed publishes a new default revision with the updated policy name.
  }
  if (service === "service-request") {
    for (const old of legacy.cases) {
      const current = catalog.cases.find((row) => row.key === old.key);
      const where = {
        tenantId,
        equipmentId: old.equipmentId,
        title: old.title,
      };
      await db.serviceRequest.updateMany({
        where: { ...where, description: oldDescription },
        data: { description: current.description },
      });
      await db.serviceRequest.updateMany({
        where,
        data: { title: current.title },
      });
    }
  }
  if (service === "workorder") {
    await renameRows(
      db,
      "technician",
      legacy.technicians,
      catalog.technicians,
      ["employeeCode"],
      scope,
    );
    await renameRows(
      db,
      "skill",
      legacy.skills,
      catalog.skills,
      ["code", "name"],
      scope,
    );
    const orderIds = [];
    for (const old of legacy.cases) {
      const current = catalog.cases.find((row) => row.key === old.key);
      await db.workOrder.updateMany({
        where: { tenantId, equipmentId: old.equipmentId, title: old.title },
        data: { title: current.title },
      });
      const rows = await db.workOrder.findMany({
        where: { tenantId, equipmentId: old.equipmentId, title: current.title },
        select: { id: true },
      });
      orderIds.push(...rows.map((row) => row.id));
    }
    for (const [i, note] of oldLogs.entries())
      await db.workLog.updateMany({
        where: { tenantId, workOrderId: { in: orderIds }, note },
        data: { note: logs[i] },
      });
    for (const old of legacy.plans) {
      const current = catalog.plans.find((row) => row.id === old.id);
      const rows = await db.workOrder.findMany({
        where: {
          tenantId,
          equipmentId: old.equipmentId,
          maintenanceTaskId: { not: null },
          title: { contains: old.name },
        },
        select: { id: true, title: true },
      });
      for (const row of rows)
        await db.workOrder.updateMany({
          where: { tenantId, id: row.id, title: row.title },
          data: { title: row.title.replace(old.name, current.name) },
        });
    }
  }
  if (service === "maintenance")
    await renameRows(
      db,
      "maintenancePlan",
      legacy.plans,
      catalog.plans,
      ["name"],
      scope,
    );
  if (service === "inventory") {
    await renameRows(
      db,
      "part",
      legacy.parts,
      catalog.parts,
      ["sku", "name"],
      scope,
    );
    await renameRows(
      db,
      "warehouse",
      legacy.warehouses,
      catalog.warehouses,
      ["code", "name"],
      scope,
    );
    await db.stockTransaction.updateMany({
      where: {
        tenantId,
        warehouseId: { in: catalog.warehouses.map((w) => w.id) },
        partId: { in: catalog.parts.map((p) => p.id) },
        type: "RECEIVE",
        note: "Nhập tồn đầu kỳ demo",
      },
      data: { note: "Nhập tồn đầu kỳ" },
    });
    // Idempotency requests/responses are immutable proofs, including their original notes.
  }
  if (service === "notification") {
    const rows = await db.notification.findMany({
      where: { tenantId },
      select: { id: true, title: true, content: true, payload: true },
    });
    for (const row of rows) {
      const title = renameText(row.title),
        content = renameText(row.content),
        payload = renameText(row.payload);
      if (
        title === row.title &&
        content === row.content &&
        JSON.stringify(payload) === JSON.stringify(row.payload)
      )
        continue;
      await db.notification.updateMany({
        where: { tenantId, id: row.id },
        data: { title, content, ...(payload === null ? {} : { payload }) },
      });
    }
  }
}
module.exports = { refreshOwnedLabels, legacy, logs };
