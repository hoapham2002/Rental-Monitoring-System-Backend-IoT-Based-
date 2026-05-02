import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
 
/**
 * Use on any route that requires a logged-in user.
 * Reads Authorization: Bearer <token> and validates JWT.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}