import type {
  Branch,
  BranchUserAssignment,
} from '../generated/prisma/client.js';

export interface BranchResponse {
  id: string;
  code: string;
  name: string;
  address: string;
  phone: string | null;
  email: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BranchUserAssignmentResponse {
  id: string;
  branchId: string;
  userId: string;
  isPrimary: boolean;
  createdAt: Date;
}

export function toAssignmentResponse(
  assignment: BranchUserAssignment,
): BranchUserAssignmentResponse {
  return {
    id: assignment.id,
    branchId: assignment.branchId,
    userId: assignment.userId,
    isPrimary: assignment.isPrimary,
    createdAt: assignment.createdAt,
  };
}

export function toBranchResponse(branch: Branch): BranchResponse {
  return {
    id: branch.id,
    code: branch.code,
    name: branch.name,
    address: branch.address,
    phone: branch.phone,
    email: branch.email,
    status: branch.status,
    createdAt: branch.createdAt,
    updatedAt: branch.updatedAt,
  };
}
