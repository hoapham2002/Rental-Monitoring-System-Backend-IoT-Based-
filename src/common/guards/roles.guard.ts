import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, UserRole } from '../decorators/roles.decorator';
 
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
 
  canActivate(context: ExecutionContext): boolean {
    // Get required roles from @Roles() decorator (method first, then class)
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
 
    // No @Roles() → route is open to any authenticated user
    if (!requiredRoles || requiredRoles.length === 0) return true;
 
    const { user } = context.switchToHttp().getRequest();
 
    if (!user) {
      throw new ForbiddenException('No authenticated user found.');
    }
 
    const hasRole = requiredRoles.includes(user.role);
 
    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required: [${requiredRoles.join(', ')}]. Your role: ${user.role}.`,
      );
    }
 
    return true;
  }
}