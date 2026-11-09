import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ServiceHttpClient, UpstreamError } from '@pbl6/service-kit';
import type { Principal } from './principal';
import type { RequestWithPrincipal } from './decorators';
import { dataScope, type DataScope } from './scope';
import { IS_PUBLIC_KEY } from '@pbl6/service-kit';

const BRANCH_SCOPED = 'pbl6:branchScoped';
export const BranchScoped = (): ClassDecorator & MethodDecorator =>
  SetMetadata(BRANCH_SCOPED, true);

export interface StaffBranchContext {
  tenantId: string;
  userId: string;
  branch: { id: string; code: string; name: string } | null;
}

/** Organization remains the source of staff membership; no branch header/JWT supplied by clients is trusted. */
export class BranchAccessClient {
  private readonly http: ServiceHttpClient;
  constructor(baseUrl: string) {
    this.http = new ServiceHttpClient({
      name: 'organization-service',
      baseUrl,
    });
  }
  async activeBranch(id: string, p: Principal): Promise<void> {
    const branch = await this.http.getOrNull<{ id: string; status: string }>(
      `/internal/branches/${id}`,
      { accessToken: p.accessToken },
    );
    if (
      !branch ||
      branch.id.toLowerCase() !== id.toLowerCase() ||
      branch.status !== 'ACTIVE'
    )
      throw new NotFoundException({
        code: 'BRANCH_NOT_FOUND',
        message: 'Active branch not found in this tenant',
      });
  }
  async context(p: Principal): Promise<StaffBranchContext> {
    try {
      const result = await this.http.get<StaffBranchContext>(
        '/internal/staff-branch',
        { accessToken: p.accessToken },
      );
      if (
        result.tenantId !== p.tenantId ||
        result.userId !== p.userId ||
        (result.branch !== null &&
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            result.branch?.id,
          ))
      )
        throw new Error('Invalid branch context');
      return result;
    } catch (error) {
      if (error instanceof UpstreamError && [401, 403].includes(error.status))
        throw new ForbiddenException({
          code: 'BRANCH_SCOPE_MISSING',
          message: 'Cannot resolve the staff branch',
        });
      throw new ServiceUnavailableException({
        code: 'BRANCH_SCOPE_UNAVAILABLE',
        message: 'Organization branch lookup is unavailable',
      });
    }
  }
}

@Injectable()
export class BranchScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly branches: BranchAccessClient,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) ||
      !this.reflector.getAllAndOverride<boolean>(BRANCH_SCOPED, targets)
    )
      return true;
    const p = context.switchToHttp().getRequest<RequestWithPrincipal>().user;
    if (!p || p.userType !== 'TENANT_STAFF') return true;
    if (p.roles.includes('TENANT_ADMIN')) {
      p.branchId = null;
      return true;
    }
    const result = await this.branches.context(p);
    if (!result.branch)
      throw new ForbiddenException({
        code: 'BRANCH_SCOPE_MISSING',
        message: 'Assign an active primary branch to this staff account',
      });
    p.branchId = result.branch.id;
    return true;
  }
}

/** Only Tenant Admin bypasses branch boundaries, including accounts with several roles. */
export function staffBranchId(p: Principal): string | null {
  if (p.userType !== 'TENANT_STAFF' || p.roles.includes('TENANT_ADMIN'))
    return null;
  if (!p.branchId)
    throw new ForbiddenException({
      code: 'BRANCH_SCOPE_MISSING',
      message: 'Staff branch scope is required',
    });
  return p.branchId;
}
export function branchWhere(p: Principal): { branchId?: string } {
  const id = staffBranchId(p);
  return id ? { branchId: id } : {};
}
export function branchDataScope(p: Principal): DataScope {
  return { ...dataScope(p), ...branchWhere(p) };
}
export function assertBranchAccess(
  p: Principal,
  branchId: string | null | undefined,
): void {
  const allowed = staffBranchId(p);
  if (allowed && allowed.toLowerCase() !== branchId?.toLowerCase())
    throw new NotFoundException({
      code: 'NOT_FOUND',
      message: 'Resource not found',
    });
}
