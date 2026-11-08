import { is } from './checks';
import {
  validMaintenanceProfile,
  validWarrantyPolicy,
  type MaintenanceProfileBody,
  type WarrantyPolicyBody,
} from './model-policies';

/** Frozen service setup; only Asset publishes it after customer acceptance. */
export interface ModelSetupSnapshot {
  schema: 'model-setup.v1';
  modelId: string;
  handoverDate: string;
  warranty: {
    revisionId: string;
    revision: number;
    body: WarrantyPolicyBody;
    startDate: string;
    endDate: string;
  };
  maintenance: {
    revisionId: string;
    revision: number;
    body: MaintenanceProfileBody;
    sourceHash: string;
    firstDueDates: { itemId: string; date: string; endDate?: string | null }[];
  };
  overrideReason: string;
  hash: string;
}
const positive = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
export const hashCheck = (v: unknown) =>
  typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export function validModelSetupSnapshot(
  value: unknown,
): value is ModelSetupSnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as ModelSetupSnapshot;
  return (
    s.schema === 'model-setup.v1' &&
    is.uuid(s.modelId) &&
    is.isoDate(s.handoverDate) &&
    hashCheck(s.hash) &&
    typeof s.overrideReason === 'string' &&
    s.overrideReason.length <= 2000 &&
    !!s.warranty &&
    is.uuid(s.warranty.revisionId) &&
    positive(s.warranty.revision) &&
    validWarrantyPolicy(s.warranty.body) &&
    is.isoDate(s.warranty.startDate) &&
    is.isoDate(s.warranty.endDate) &&
    !!s.maintenance &&
    is.uuid(s.maintenance.revisionId) &&
    positive(s.maintenance.revision) &&
    validMaintenanceProfile(s.maintenance.body) &&
    hashCheck(s.maintenance.sourceHash) &&
    Array.isArray(s.maintenance.firstDueDates) &&
    s.maintenance.firstDueDates.length <= 8 &&
    s.maintenance.firstDueDates.every(
      (d) =>
        !!d &&
        is.uuid(d.itemId) &&
        is.isoDate(d.date) &&
        (d.endDate === undefined ||
          d.endDate === null ||
          is.isoDate(d.endDate)),
    )
  );
}
export interface EquipmentRegistrationConfirmedV1 {
  registrationId: string;
  equipmentId: string;
  customerId: string;
  customerSiteId: string;
  snapshotVersion: number;
  submittedBy: string;
  confirmedBy: string;
  confirmedAt: string;
  snapshot: ModelSetupSnapshot;
}
export interface RegistrationMaintenanceReadyV1 {
  registrationId: string;
  equipmentId: string;
  inputHash: string;
  plans: { itemId: string; planId: string }[];
}
