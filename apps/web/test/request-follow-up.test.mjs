import assert from 'node:assert/strict';
import test from 'node:test';
import { hooks, nodes, webTab } from './helpers/web-tab.mjs';

function setup(roles = ['SERVICE_MANAGER'], response = { loading: false, data: { total: 8, items: [{ id: 'sr-1', requestNo: 'SR-2026-1', title: 'Máy ngừng chạy', followUp: { reason: '<script>text only</script>', recordedAt: '2026-11-12T00:00:00Z', responsibleRole: 'SERVICE_MANAGER', nextAction: 'Kiểm tra phương án' } }] } }) {
  const h = hooks(), calls = [];
  const tab = webTab(async () => { throw Error('Unexpected fetch'); });
  const realData = tab.load('features/workspace/workspace-data.ts', { react: h.react, '../../api/client': tab.client, '../../auth/session': tab.session });
  const { default: Queue } = tab.load('features/workspace/RequestFollowUpQueue.tsx', {
    react: h.react, 'react/jsx-runtime': h.jsx, 'react-router-dom': { Link: 'a' },
    'lucide-react': { AlertTriangle: 'warning-icon' },
    '../../auth/session': { useSession: () => ({ profile: { roles, userType: roles.includes('CUSTOMER_USER') ? 'CUSTOMER' : 'TENANT_STAFF' } }) },
    './WorkspaceUI': { DataState: 'DataState', Pagination: 'Pagination' },
    './workspace-data': { ...realData, useWorkspaceData: (_area, path) => { calls.push(path); return response; } },
    './service-detail-data': { recordAge: () => '2 giờ' }, './request-follow-up.css': {},
  });
  return { render: (props) => h.render(Queue, props), calls };
}
const text = (tree) => JSON.stringify(tree);
test('red queue uses server count, scoped filter, exact SR link and text-only reason', () => {
  const f = setup(), tree = f.render();
  assert.match(f.calls[0], /followUp=UNRESOLVED/);
  assert.match(text(tree), /Cảnh báo: Yêu cầu chưa xử lý được/);
  assert.equal(nodes(tree, n => n.type === 'a')[0].props.to, '/app/service-requests/sr-1');
  assert.equal(nodes(tree, n => n.type === 'Pagination')[0].props.total, 8);
  assert.equal(nodes(tree, n => 'dangerouslySetInnerHTML' in n.props).length, 0);
  nodes(tree, n => n.type === 'select')[0].props.onChange({ target: { value: 'PARTIALLY_RESOLVED' } });
  assert.match(f.render().props.className, /amber/);
  assert.match(f.calls.at(-1), /followUp=PARTIALLY_RESOLVED/);
});
test('queue pagination requests all pages instead of counting a dashboard sample', () => {
  const f = setup();
  nodes(f.render(), n => n.type === 'Pagination')[0].props.onChange(2);
  f.render();
  assert.match(f.calls.at(-1), /page=2/);
});
test('customer and wrong role cannot load the queue; only tenant admin loads unallocated', () => {
  for (const roles of [['CUSTOMER_USER'], ['TECHNICIAN'], ['TENANT_ADMIN']]) {
    const f = setup(roles); assert.equal(f.render(), null); assert.equal(f.calls[0], null);
  }
  const staff = setup(); assert.equal(staff.render({ unallocated: true }), null);
  const admin = setup(['TENANT_ADMIN']); admin.render({ unallocated: true });
  assert.match(admin.calls[0], /unallocated=true/);
});
test('passes loading/error/retry to existing DataState and removes resolved warning on fresh read', () => {
  for (const response of [{ loading: true }, { loading: false, error: 'Unavailable' }]) {
    const f = setup(undefined, response);
    const state = nodes(f.render(), n => n.type === 'DataState')[0];
    assert.equal(state.props.loading, response.loading);
    assert.equal(state.props.error, response.error);
    state.props.retry();
  }
  const empty = setup(undefined, { loading: false, data: { total: 0, items: [] } }).render();
  assert.match(text(empty), /Không có yêu cầu/);
  assert.equal(nodes(empty, n => n.type === 'a').length, 0);
});
