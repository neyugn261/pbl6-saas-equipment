import assert from "node:assert/strict";
import test from "node:test";
import { hooks, nodes, settle, webTab } from "./helpers/web-tab.mjs";

function setup(
  fetch,
  profile = {
    id: "manager",
    tenantId: "tenant",
    roles: ["SERVICE_MANAGER"],
    userType: "TENANT_STAFF",
  },
) {
  const tab = webTab(fetch),
    host = hooks();
  tab.session.useSession = () => ({ profile });
  const directory = tab.load("routes/registration-data.ts", {
    react: host.react,
    "../api/client": tab.client,
    "../auth/session": tab.session,
  });
  const components = tab.load("features/workspace/BranchManagement.tsx", {
    react: host.react,
    "react/jsx-runtime": host.jsx,
    "react-router-dom": { Link: "link" },
    "../../api/client": tab.client,
    "../../auth/session": tab.session,
    "../../routes/registration-data": directory,
    "../../display-names": tab.load("display-names.ts"),
    "./service-detail-data": tab.load("features/workspace/service-detail-data.ts"),
    "./workspace-data": tab.load("features/workspace/workspace-data.ts", {
      react: host.react, "../../api/client": tab.client, "../../auth/session": tab.session,
    }),
  });
  return { tab, host, components };
}

test("branch notice uses live context and immediately hides the previous session branch", async () => {
  const { tab, host, components } = setup(() =>
    Response.json({ branch: { id: "a", name: "Chi nhánh A" } }),
  );
  host.render(components.BranchScopeNotice);
  await settle();
  assert.match(
    JSON.stringify(host.render(components.BranchScopeNotice)),
    /Chi nhánh A/,
  );
  tab.changeSession();
  assert.doesNotMatch(
    JSON.stringify(host.render(components.BranchScopeNotice)),
    /Chi nhánh A/,
  );
});

test("missing branch and dependency errors never claim whole-tenant access", async () => {
  for (const response of [
    Response.json({ branch: null }),
    Response.json({ message: "Organization unavailable" }, { status: 503 }),
  ]) {
    const { host, components } = setup(() => response);
    host.render(components.BranchScopeNotice);
    await settle();
    const tree = host.render(components.BranchScopeNotice);
    assert.equal(tree.props.role, "alert");
    assert.doesNotMatch(
      JSON.stringify(tree),
      /Phạm vi quản trị: toàn doanh nghiệp/,
    );
  }
});

test("Tenant Admin shows central allocation and customer portal makes no staff lookup", async () => {
  for (const profile of [
    { roles: ["TENANT_ADMIN"], userType: "TENANT_STAFF" },
    { roles: ["CUSTOMER_ADMIN"], userType: "CUSTOMER" },
  ]) {
    let calls = 0;
    const { host, components } = setup(() => {
      calls++;
      return Response.json({});
    }, profile);
    const tree = host.render(components.BranchScopeNotice);
    await settle();
    assert.equal(calls, 0);
    if (profile.userType === "CUSTOMER") assert.equal(tree, null);
    else assert.match(JSON.stringify(tree), /service-branches/);
  }
});

test("primary assignment sends the selected branch and explicit isPrimary without recreating the user", async () => {
  const calls = [];
  const { host, components } = setup((url, options) => {
    calls.push({ url, options });
    return Response.json({ branch: { id: "a", name: "A" } });
  });
  host.render(components.StaffBranchAssignment, { userId: "tech" });
  await settle();
  let tree = host.render(components.StaffBranchAssignment, { userId: "tech" });
  nodes(tree, (node) => node.type?.name === "BranchSelect")[0].props.onChange(
    "b",
  );
  tree = host.render(components.StaffBranchAssignment, { userId: "tech" });
  nodes(tree, (node) => node.type === "button")[0].props.onClick();
  await settle();
  const mutation = calls.find((call) => call.options.method === "POST");
  assert.equal(mutation.url, "/gateway/api/organization/branches/b/users");
  assert.deepEqual(JSON.parse(mutation.options.body), {
    userId: "tech",
    isPrimary: true,
  });
});

test("site routing can explicitly clear its default and handles missing API without reporting success", async () => {
  const calls = [];
  let saved = 0;
  const { host, components } = setup((url, options) => {
    calls.push({ url, options });
    return Response.json({ message: "Unavailable" }, { status: 503 });
  });
  const props = { siteId: "site", branchId: "a", onSaved: () => saved++ };
  let tree = host.render(components.SiteBranchRouting, props);
  nodes(tree, (node) => node.type?.name === "BranchSelect")[0].props.onChange(
    "",
  );
  tree = host.render(components.SiteBranchRouting, props);
  nodes(tree, (node) => node.type === "button")[0].props.onClick();
  await settle();
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    defaultServicingBranchId: null,
  });
  assert.equal(saved, 0);
  assert.match(
    JSON.stringify(host.render(components.SiteBranchRouting, props)),
    /Unavailable/,
  );
});
