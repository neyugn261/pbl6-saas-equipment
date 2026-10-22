/**
 * Ids of Identity's demo accounts. Identity generates them, and Organization
 * may not read identity_db, so they are read from Identity's login response
 * (`user.id`) with the demo password — through the API only.
 */
export async function lookUpDemoUsers(
  identityUrl: string | undefined,
  password: string | undefined,
  tenantCode: string,
  emails: string[],
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  if (!identityUrl || !password) {
    console.warn('IDENTITY_SERVICE_URL or SEED_DEMO_PASSWORD is not set: demo accounts are not linked.');
    return ids;
  }
  for (const email of emails) {
    try {
      const response = await fetch(new URL('/auth/login', identityUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantCode, email, password }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        console.warn(`Login of ${email} failed (${response.status}); run identity-service db:seed:dev first.`);
        continue;
      }
      const body = (await response.json()) as { user: { id: string } };
      ids.set(email, body.user.id);
    } catch {
      console.warn(`Identity Service is not reachable at ${identityUrl}: demo accounts are not linked.`);
      return ids;
    }
  }
  return ids;
}
