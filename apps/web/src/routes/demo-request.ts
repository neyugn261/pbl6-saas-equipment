const storagePrefix = 'pbl6.demo.request.'

export function rememberDemoRequest(tenantId: string | null, requestId: string) {
  if (tenantId) sessionStorage.setItem(`${storagePrefix}${tenantId}`, requestId)
}

export function lastDemoRequest(tenantId: string | null) {
  return tenantId ? sessionStorage.getItem(`${storagePrefix}${tenantId}`) : null
}
