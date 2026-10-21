import type { Branch } from '../generated/prisma/client.js';

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
