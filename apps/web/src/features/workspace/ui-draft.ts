export function draftKey(
  profile:
    | {
        id?: string;
        tenantId?: string | null;
        customerId?: string | null;
        userType?: string;
      }
    | null
    | undefined,
  form: string,
) {
  return profile?.id
    ? `servio.ui-draft:${JSON.stringify([profile.userType, profile.tenantId, profile.customerId, profile.id, form])}`
    : null;
}
export function loadDraft<T extends object>(key: string | null, initial: T): T {
  if (!key) return initial;
  try {
    const text = sessionStorage.getItem(key) ?? "null";
    if (text.length > 150000) return initial;
    const raw = JSON.parse(text);
    if (
      !raw ||
      raw.version !== 1 ||
      typeof raw.values !== "object" ||
      !raw.values ||
      Array.isArray(raw.values) ||
      !Number.isFinite(raw.expiresAt) ||
      (raw.expiresAt < Date.now() && !raw.values.submissionPending)
    )
      return initial;
    const compatible = (value: unknown, example: unknown): boolean =>
      Array.isArray(example)
        ? Array.isArray(value) &&
          value.length < 200 &&
          (!example.length ||
            value.every((item) => compatible(item, example[0])))
        : example && typeof example === "object"
          ? Boolean(
              value &&
              typeof value === "object" &&
              !Array.isArray(value) &&
              Object.entries(example).every(([name, child]) =>
                compatible((value as Record<string, unknown>)[name], child),
              ),
            )
          : typeof value === typeof example;
    if (
      !Object.entries(initial).every(
        ([name, example]) =>
          !(name in raw.values) || compatible(raw.values[name], example),
      )
    )
      return initial;
    return {
      ...initial,
      ...Object.fromEntries(
        Object.entries(raw.values).filter(([name]) => name in initial),
      ),
    };
  } catch {
    return initial;
  }
}
export function storeDraft(key: string | null, values: object) {
  if (!key) return false;
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        expiresAt: Date.now() + 12 * 60 * 60 * 1000,
        values,
      }),
    );
    return true;
  } catch {
    return false;
  }
}
export function clearDraft(key: string | null) {
  if (key)
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* Retain the in-memory form if storage is unavailable. */
    }
}
