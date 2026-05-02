import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../common/schemas';
 
export interface JwtPayload {
  sub: string;       // user._id
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}
 
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }
 
  async validate(payload: JwtPayload): Promise<UserDocument> {
    const user = await this.userModel
      .findById(payload.sub)
      .select('-password')
      .lean();
 
    if (!user) {
      throw new UnauthorizedException('User no longer exists.');
    }
 
    return user as UserDocument;
  }
}