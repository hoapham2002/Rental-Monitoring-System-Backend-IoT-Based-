import { SetMetadata } from '@nestjs/common';
 
export type UserRole = 'admin' | 'owner' | 'tenant';
export const ROLES_KEY = 'roles';
 
/**
 * @Roles('admin', 'owner') – attach to controller or route handler.
 * Pair with RolesGuard.
 *
 * @example
 * @Roles('owner', 'admin')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Post('/bills')
 * createBill(@Body() dto: CreateBillDto) { ... }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);