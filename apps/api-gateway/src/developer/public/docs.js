/* global document, window, fetch, SwaggerUIBundle, URL, URLSearchParams */
'use strict';
const serviceSelect = document.querySelector('#service');
const errorBox = document.querySelector('#error');
let services = [];
let ui;
let selectedId;
function show(service) {
  const token = ui?.authSelectors.authorized().getIn(['bearer', 'value']);
  selectedId = service.id;
  document.querySelector('#stage').textContent = service.stage;
  document.querySelector('#planned').hidden = service.interactive;
  document.querySelector('#download').href = service.specUrl;
  const location = new URL(window.location.href);
  location.searchParams.set('service', service.id);
  location.hash = '';
  window.history.replaceState(null, '', location);
  serviceSelect.value = service.id;
  ui = SwaggerUIBundle({
    dom_id: '#swagger-ui',
    url: service.specUrl,
    deepLinking: true,
    filter: true,
    displayRequestDuration: true,
    defaultModelsExpandDepth: -1,
    supportedSubmitMethods: service.interactive
      ? ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']
      : [],
    persistAuthorization: false,
    validatorUrl: null,
    queryConfigEnabled: false,
    onComplete: () => {
      if (token && selectedId === service.id)
        ui.preauthorizeApiKey('bearer', token);
    },
  });
  window.ui = ui;
}
async function start() {
  try {
    const response = await fetch('/dev/catalog', { cache: 'no-store' });
    if (!response.ok) throw new Error('Catalog unavailable');
    services = (await response.json()).filter((service) => service.specUrl);
    serviceSelect.replaceChildren(
      ...services.map((service) => {
        const option = document.createElement('option');
        option.value = service.id;
        option.textContent =
          service.name + (service.interactive ? '' : ' · contract');
        return option;
      }),
    );
    serviceSelect.disabled = false;
    const requested =
      new URLSearchParams(window.location.search).get('service') ?? 'workorder';
    show(services.find((service) => service.id === requested) ?? services[0]);
    serviceSelect.addEventListener('change', () => {
      show(services.find((service) => service.id === serviceSelect.value));
    });
  } catch {
    errorBox.textContent =
      'Không tải được API Explorer. Kiểm tra Gateway và tải lại trang.';
    errorBox.hidden = false;
  }
}
void start();
