/* global document, window, fetch, AbortSignal */
'use strict';
const refreshButton = document.querySelector('#refresh');
const errorBox = document.querySelector('#error');
let pending = false;
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
async function refresh() {
  if (pending) return;
  pending = true;
  refreshButton.disabled = true;
  try {
    const response = await fetch('/dev/status', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Gateway status ' + response.status);
    const data = await response.json();
    const cards = data.services.map((service) => {
      const card = element('article', undefined, 'card');
      const top = element('div', undefined, 'card-top');
      top.append(
        element('h2', service.name),
        element(
          'span',
          { up: 'UP', down: 'DOWN', 'no-health': 'CHƯA CÓ HEALTH' }[
            service.state
          ],
          'badge ' + service.state,
        ),
      );
      const metadata = element('div', undefined, 'metadata');
      metadata.append(
        element('span', service.address),
        element(
          'span',
          service.httpStatus
            ? `HTTP ${service.httpStatus} · ${service.latencyMs}ms`
            : 'Không kết nối được',
        ),
      );
      const links = element('div', undefined, 'card-links');
      if (service.docsUrl) {
        const docs = element(
          'a',
          service.interactive ? 'Mở API Explorer →' : 'Đọc contract →',
        );
        docs.href = service.docsUrl;
        links.append(docs);
      } else links.append(element('span', 'Chưa có OpenAPI', 'muted'));
      const health = element('a', 'Health ↗');
      health.href = service.healthUrl;
      health.target = '_blank';
      health.rel = 'noreferrer';
      links.append(health);
      card.append(
        top,
        element('p', service.stage, 'stage'),
        metadata,
        element('code', service.apiPrefix),
        links,
      );
      return card;
    });
    document.querySelector('#services').replaceChildren(...cards);
    const up = data.services.filter((service) => service.state === 'up').length;
    document.querySelector('#overall').textContent =
      `${up}/${data.services.length} health UP`;
    document.querySelector('#overall-dot').className =
      'dot ' +
      (up === data.services.length
        ? 'up'
        : data.services.some((service) => service.state === 'down')
          ? 'down'
          : 'no-health');
    document.querySelector('#checked-at').textContent =
      'Cập nhật ' + new Date(data.checkedAt).toLocaleTimeString('vi-VN');
    errorBox.hidden = true;
  } catch {
    errorBox.textContent =
      'Không đọc được trạng thái mới. Kiểm tra Gateway đang chạy; thông tin lần trước có thể đã cũ.';
    errorBox.hidden = false;
    document.querySelector('#overall').textContent = 'Chưa xác nhận trạng thái';
    document.querySelector('#overall-dot').className = 'dot neutral';
  } finally {
    pending = false;
    refreshButton.disabled = false;
  }
}
refreshButton.addEventListener('click', () => {
  void refresh();
});
window.setInterval(() => {
  if (document.querySelector('#auto').checked && !document.hidden)
    void refresh();
}, 10000);
void refresh();
