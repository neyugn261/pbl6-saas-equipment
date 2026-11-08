/** Immutable service-policy wire contract. No persistence or authorization lives here. */
export const POLICY_CAUSES = [
  'MANUFACTURING_DEFECT',
  'ACCIDENTAL_DAMAGE',
  'LIQUID_INGRESS',
  'MISUSE',
  'WEAR_AND_TEAR',
  'UNKNOWN',
] as const;
export type PolicyCause = (typeof POLICY_CAUSES)[number];
export interface ChecklistItem {
  id: string;
  title: string;
  action: 'INSPECT' | 'CLEAN' | 'LUBRICATE' | 'ADJUST' | 'REPLACE';
  instructions: string;
  required: boolean;
  allowNotApplicable: boolean;
}
export interface WarrantyPolicyBody {
  mode: 'APPLY' | 'NONE';
  name: string;
  terms: string;
  reason: string;
  durationMonths: number;
  coveredCauses: PolicyCause[];
  exclusions: { code: PolicyCause; text: string }[];
}
export type MaintenanceTerm =
  | { mode: 'UNLIMITED' }
  | { mode: 'YEARS'; years: number }
  | { mode: 'WARRANTY_END' };
export interface MaintenanceRule {
  id: string;
  name: string;
  frequencyUnit: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  frequencyValue: number;
  firstOccurrence: number;
  /** Absent on immutable legacy policies: retains unlimited scheduling. */
  term?: MaintenanceTerm;
  checklist: ChecklistItem[];
}
export interface MaintenanceProfileBody {
  mode: 'APPLY' | 'NONE';
  name: string;
  terms: string;
  reason: string;
  rules: MaintenanceRule[];
}
export interface PolicyRevision<T> {
  id: string;
  modelId: string;
  revision: number;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
  isDefault: boolean;
  body: T;
}
export interface ChecklistResult {
  itemId: string;
  status: 'NOT_DONE' | 'DONE' | 'NOT_APPLICABLE';
  note: string;
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number, empty = false): v is string =>
  typeof v === 'string' && (empty || v.trim().length > 0) && v.length <= max;
const integer = (v: unknown, max: number) =>
  Number.isSafeInteger(v) && (v as number) >= 1 && (v as number) <= max;
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
export const policyUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(v);
const unique = (ids: string[]) =>
  new Set(
    ids.map((id) => (typeof id === 'string' ? id.toLowerCase() : 'INVALID')),
  ).size === ids.length;
export function validMaintenanceTerm(v: unknown): v is MaintenanceTerm {
  if (!record(v)) return false;
  if (v.mode === 'YEARS')
    return keys(v, ['mode', 'years']) && integer(v.years, 100);
  return (
    keys(v, ['mode']) && ['UNLIMITED', 'WARRANTY_END'].includes(String(v.mode))
  );
}
export function validChecklist(v: unknown): v is ChecklistItem[] {
  return (
    Array.isArray(v) &&
    JSON.stringify(v).length <= 40000 &&
    v.length <= 60 &&
    unique(v.map((i) => (record(i) && typeof i.id === 'string' ? i.id : ''))) &&
    v.every(
      (i) =>
        record(i) &&
        keys(i, [
          'id',
          'title',
          'action',
          'instructions',
          'required',
          'allowNotApplicable',
        ]) &&
        policyUuid(i.id) &&
        text(i.title, 200) &&
        ['INSPECT', 'CLEAN', 'LUBRICATE', 'ADJUST', 'REPLACE'].includes(
          String(i.action),
        ) &&
        text(i.instructions, 2000, true) &&
        typeof i.required === 'boolean' &&
        typeof i.allowNotApplicable === 'boolean',
    )
  );
}
export function validWarrantyPolicy(v: unknown): v is WarrantyPolicyBody {
  return (
    record(v) &&
    keys(v, [
      'mode',
      'name',
      'terms',
      'reason',
      'durationMonths',
      'coveredCauses',
      'exclusions',
    ]) &&
    ['APPLY', 'NONE'].includes(String(v.mode)) &&
    text(v.name, 200) &&
    text(v.terms, 10000, true) &&
    text(v.reason, 2000, v.mode === 'APPLY') &&
    integer(v.durationMonths, 1200) &&
    Array.isArray(v.coveredCauses) &&
    unique(v.coveredCauses as string[]) &&
    v.coveredCauses.every(
      (c) => POLICY_CAUSES.includes(c) && c !== 'UNKNOWN',
    ) &&
    Array.isArray(v.exclusions) &&
    v.exclusions.length <= 20 &&
    v.exclusions.every(
      (e) =>
        record(e) &&
        keys(e, ['code', 'text']) &&
        POLICY_CAUSES.includes(e.code as PolicyCause) &&
        e.code !== 'UNKNOWN' &&
        text(e.text, 2000),
    ) &&
    unique(v.exclusions.map((e) => e.code)) &&
    !v.exclusions.some((e) => (v.coveredCauses as string[]).includes(e.code))
  );
}
export function validMaintenanceProfile(
  v: unknown,
): v is MaintenanceProfileBody {
  return (
    record(v) &&
    JSON.stringify(v).length <= 60000 &&
    keys(v, ['mode', 'name', 'terms', 'reason', 'rules']) &&
    ['APPLY', 'NONE'].includes(String(v.mode)) &&
    text(v.name, 200) &&
    text(v.terms, 10000, true) &&
    text(v.reason, 2000, v.mode === 'APPLY') &&
    Array.isArray(v.rules) &&
    v.rules.length <= 8 &&
    (v.mode === 'NONE' ? v.rules.length === 0 : v.rules.length > 0) &&
    unique(v.rules.map((r) => (record(r) ? String(r.id) : ''))) &&
    v.rules.every(
      (r) =>
        record(r) &&
        keys(r, [
          'id',
          'name',
          'frequencyUnit',
          'frequencyValue',
          'firstOccurrence',
          'term',
          'checklist',
        ]) &&
        policyUuid(r.id) &&
        text(r.name, 200) &&
        ['DAY', 'WEEK', 'MONTH', 'YEAR'].includes(String(r.frequencyUnit)) &&
        integer(r.frequencyValue, 1000) &&
        integer(r.firstOccurrence, 100) &&
        (r.term === undefined || validMaintenanceTerm(r.term)) &&
        validChecklist(r.checklist) &&
        r.checklist.length > 0,
    )
  );
}
/** UTC calendar date only; never local JS timezone arithmetic. */
export function addPolicyMonths(day: string, months: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !integer(months, 12000))
    throw new Error('Invalid calendar input');
  const source = new Date(day + 'T00:00:00Z');
  if (!Number.isFinite(+source) || source.toISOString().slice(0, 10) !== day)
    throw new Error('Invalid calendar date');
  const target = new Date(source);
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const last = new Date(target);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  target.setUTCDate(Math.min(source.getUTCDate(), last.getUTCDate()));
  if (target.getUTCFullYear() > 9999) throw new Error('Calendar overflow');
  return target.toISOString().slice(0, 10);
}
export function warrantyEnd(day: string, months: number): string {
  const end = new Date(addPolicyMonths(day, months) + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

/** Inclusive last service day. A YEARS term includes its anniversary visit. */
export function maintenanceEndDate(
  handoverDate: string,
  term?: MaintenanceTerm,
  warrantyEndDate?: string,
): string | null {
  if (!term) return null; // Preserve legacy snapshots and pending setup hashes.
  if (!validMaintenanceTerm(term)) throw new Error('Invalid maintenance term');
  if (term.mode === 'UNLIMITED') return null;
  if (term.mode === 'YEARS')
    return addPolicyMonths(handoverDate, term.years * 12);
  if (!warrantyEndDate)
    throw new Error('WARRANTY_END requires an applied warranty');
  const day = new Date(warrantyEndDate + 'T00:00:00Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(warrantyEndDate) ||
    !Number.isFinite(+day) ||
    day.toISOString().slice(0, 10) !== warrantyEndDate ||
    warrantyEndDate < handoverDate
  )
    throw new Error('Invalid applied warranty end date');
  return warrantyEndDate;
}

export interface CustomerChecklistResult {
  itemId: string;
  title: string;
  status: 'DONE' | 'NOT_DONE' | 'NOT_APPLICABLE';
}
export function validCustomerChecklist(
  v: unknown,
): v is CustomerChecklistResult[] {
  return (
    Array.isArray(v) &&
    v.length <= 60 &&
    v.every(
      (r) =>
        record(r) &&
        keys(r, ['itemId', 'title', 'status']) &&
        policyUuid(r.itemId) &&
        text(r.title, 200) &&
        ['DONE', 'NOT_DONE', 'NOT_APPLICABLE'].includes(String(r.status)),
    ) &&
    unique(v.map((r) => r.itemId))
  );
}
