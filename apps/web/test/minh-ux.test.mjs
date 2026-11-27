import test from "node:test";
import assert from "node:assert/strict";
import { hooks, nodes, webTab } from "./helpers/web-tab.mjs";
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('customer site picker renders the real array contract, searches locally and reports bad responses without crashing', () => {
  const tab = webTab(async () => { throw new Error('Unexpected fetch'); });
  const h = hooks(), paths = [];
  let response = [
    { id: 'site-hcm', code: 'HCM', name: 'Cơ sở Hồ Chí Minh', status: 'ACTIVE' },
    { id: 'site-dn', code: 'DN', name: 'Cơ sở Đà Nẵng', status: 'ACTIVE' },
    { id: 'inactive', code: 'OLD', name: 'Cơ sở cũ', status: 'INACTIVE' },
  ];
  const { DirectoryPicker } = tab.load('routes/registration-shared.tsx', {
    react: h.react, 'react/jsx-runtime': h.jsx,
    '../api/client': tab.client,
    '../auth/session': tab.session,
    '../components/PageTitle': { PageTitle: 'page-title' },
    './registration-data': {
      errorText: error => error.message,
      useDirectory: (_area, path) => {
        paths.push(path);
        return { value: response, loading: false, error: '' };
      },
    },
  });
  const selected = [];
  const props = { label: 'Địa điểm khách hàng', area: 'organization', path: '/customers/customer/sites',
    selected: '', responseShape: 'list', onChange: id => selected.push(id) };
  let tree = h.render(DirectoryPicker, props);
  assert.equal(paths[0], '/customers/customer/sites');
  assert.deepEqual(nodes(tree, n => n.type === 'option').map(n => n.props.value), ['', 'site-hcm', 'site-dn']);
  nodes(tree, n => n.type === 'select')[0].props.onChange({ target: { value: 'site-dn' } });
  assert.deepEqual(selected, ['site-dn']);
  nodes(tree, n => n.type === 'input')[0].props.onChange({ target: { value: 'Đà Nẵng' } });
  tree = h.render(DirectoryPicker, props);
  nodes(tree, n => n.type === 'button' && n.props.children === 'Tìm')[0].props.onClick();
  tree = h.render(DirectoryPicker, props);
  assert.deepEqual(nodes(tree, n => n.type === 'option').map(n => n.props.value), ['', 'site-dn']);
  assert.ok(paths.every(path => path === '/customers/customer/sites'));
  response = { unexpected: true };
  tree = h.render(DirectoryPicker, props);
  assert.equal(nodes(tree, n => n.type === 'select')[0].props.disabled, true);
  assert.ok(nodes(tree, n => n.props.error?.includes('không đúng định dạng')).length);
});

test("pricing conflict preserves edited fields and requires explicit reload instead of reporting success", async () => {
  const tab = webTab(async () => {
      throw new Error("Unexpected fetch");
    }),
    h = hooks(),
    calls = [];
  let saved = 0;
  const { PartPricing } = tab.load("features/inventory/PartPricing.tsx", {
    react: h.react,
    "react/jsx-runtime": h.jsx,
    "../../api/client": {
      ...tab.client,
      api: {
        inventory: async (path, options) => {
          calls.push({ path, options });
          throw new tab.client.ApiError(
            409,
            "PRICING_VERSION_CONFLICT",
            "Changed",
          );
        },
      },
    },
    "./prices": tab.load("features/inventory/prices.ts"),
    "../workspace/ServiceDetailUI": { ServiceCard: "service-card", ServiceFacts: "service-facts" },
  });
  const props = {
    part: {
      id: "part",
      standardPrice: "100",
      costPrice: "70",
      currency: "VND",
      pricingVersion: 4,
    },
    canManage: true,
    onSaved: () => saved++,
  };
  let tree = h.render(PartPricing, props);
  nodes(
    tree.props.actions,
    (n) => n.type === "button" && n.props.children === "Cập nhật đơn giá",
  )[0].props.onClick();
  tree = h.render(PartPricing, props);
  nodes(tree, (n) => n.type === "input")[0].props.onChange({
    target: { value: "" },
  });
  tree = h.render(PartPricing, props);
  await nodes(tree, (n) => n.type === "form")[0].props.onSubmit({
    preventDefault() {},
  });
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.body.expectedVersion, 4);
  assert.equal(calls[0].options.body.standardPrice, null);
  assert.equal(saved, 0);
  tree = h.render(PartPricing, props);
  assert.equal(nodes(tree, (n) => n.props?.role === "alert").length, 1);
  assert.equal(nodes(tree, (n) => n.type === "input")[0].props.value, "");
});

test("an interrupted bulk import survives navigation and retries the original command with the same key", async () => {
  const storage = new Map(),
    calls = [];
  function mount() {
    const tab = webTab(
        async () => {
          throw new Error("Unexpected fetch");
        },
        {},
        storage,
      ),
      h = hooks();
    const { BulkHandoverPage } = tab.load("routes/MinhAssetUx.tsx", {
      react: h.react,
      "react/jsx-runtime": h.jsx,
      "react-router-dom": { Link: "a", useParams: () => ({}) },
      "../api/client": {
        ...tab.client,
        api: {
          asset: async (path, options) => {
            if (path.endsWith("/preview"))
              return { valid: true, count: 1, rows: [{ row: 1, valid: true }] };
            calls.push({ path, options });
            throw new Error("Lost response");
          },
        },
      },
      "../api/config": tab.config,
      "../auth/session": tab.session,
      "./registration-shared": {
        DirectoryPicker: "picker",
        SetupPage: "setup-page",
      },
      "./registration-data": {
        useDirectory: () => ({}),
        errorText: (error) => error.message,
      },
      "./minh-asset-ux.css": {},
      '../features/equipment/spreadsheet': tab.load('features/equipment/spreadsheet.ts'),
      '../display-names': tab.load('display-names.ts'),
    });
    const root = h.render(BulkHandoverPage);
    return { h, render: () => h.render(root.type, root.props) };
  }
  const first = mount();
  let tree = first.render();
  nodes(tree, (n) => n.type === "picker")[0].props.onChange("customer");
  tree = first.render();
  const sitePicker = nodes(tree, (n) => n.type === "picker")[1];
  assert.equal(sitePicker.props.path, '/customers/customer/sites');
  assert.equal(sitePicker.props.responseShape, 'list');
  nodes(tree, (n) => n.type === "picker")[1].props.onChange("site");
  nodes(tree, (n) => n.type === "picker")[2].props.onChange("model");
  nodes(tree, (n) => n.type === "textarea")[0].props.onChange({
    target: { value: "assetCode,serialNumber\nA,S" },
  });
  tree = first.render();
  await nodes(tree, (n) => n.type === "form")[0].props.onSubmit({
    preventDefault() {},
  });
  await settle();
  tree = first.render();
  nodes(
    tree,
    (n) => n.type === "button" && String(n.props.children).startsWith("Tạo "),
  )[0].props.onClick();
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(storage.size, 1);
  first.h.unmount();
  const second = mount();
  tree = second.render();
  nodes(
    tree,
    (n) => n.type === "button" && n.props.children === "Gửi lại đúng lô đã lưu",
  )[0].props.onClick();
  await settle();
  assert.equal(calls.length, 2);
  assert.equal(
    calls[0].options.headers["Idempotency-Key"],
    calls[1].options.headers["Idempotency-Key"],
  );
  assert.equal(
    JSON.stringify(calls[0].options.body),
    JSON.stringify(calls[1].options.body),
  );
});
