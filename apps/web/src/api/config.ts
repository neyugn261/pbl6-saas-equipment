// All application routes use real services. Legacy mock-mode environment flags
// cannot silently replace authenticated business data with fixtures.
export const isMockMode = false
const gateway = (import.meta.env.VITE_GATEWAY_API_URL || '/gateway').replace(/\/$/, '')
export const identityBase = (import.meta.env.VITE_IDENTITY_API_URL || `${gateway}/api/identity`).replace(/\/$/, '')
export const bases = {
  identity: identityBase,
  organization: `${gateway}/api/organization`,
  asset: `${gateway}/api/assets`,
  assetM2: `${gateway}/api/assets`,
  requests: `${gateway}/api`,
  requestsLive: `${gateway}/api`,
  workorders: `${gateway}/api/workorders`,
  maintenance: `${gateway}/api/maintenance`,
  inventory: `${gateway}/api/inventory`,
  notifications: `${gateway}/api/notifications`,
}
