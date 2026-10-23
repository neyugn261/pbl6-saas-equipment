export const isMockMode = import.meta.env.VITE_M1_API_MODE === 'mock'

const gateway = (import.meta.env.VITE_GATEWAY_API_URL || '/gateway').replace(
  /\/$/,
  '',
)

export const identityBase = (
  import.meta.env.VITE_IDENTITY_API_URL ||
  (isMockMode ? '/identity' : `${gateway}/api/identity`)
).replace(/\/$/, '')

export const bases = isMockMode
  ? {
      identity: identityBase,
      organization:
        import.meta.env.VITE_ORGANIZATION_API_URL || '/mock/organization',
      asset: import.meta.env.VITE_ASSET_API_URL || '/mock/asset',
      requests:
        import.meta.env.VITE_SERVICE_REQUEST_API_URL || '/mock/requests',
    }
  : {
      identity: identityBase,
      organization: `${gateway}/api/organization`,
      asset: `${gateway}/api/assets`,
      requests: `${gateway}/api/service-requests`,
    }
