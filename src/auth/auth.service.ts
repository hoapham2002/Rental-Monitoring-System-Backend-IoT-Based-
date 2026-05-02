import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument, Room, RoomDocument } from '../common/schemas';
import { LoginDto, InviteOwnerDto, RegisterTenantDto } from './dto/auth.dto';

const SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>, 
    private readonly jwtService: JwtService,
  ) {}

  // ── LOGIN ──────────────────────────────────────────────────────────────
  async login(dto: LoginDto) {
    const user = await this.userModel
      .findOne({ email: dto.email.toLowerCase() })
      .select('+password') // password is select:false by default
      .lean();

    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const payload = {
      sub: (user._id as Types.ObjectId).toString(),
      email: user.email,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      role: user.role,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        room_id: user.room_id,
      },
    };
  }

  // ── INVITE OWNER (Admin only) ──────────────────────────────────────────
  async inviteOwner(dto: InviteOwnerDto) {
    const existing = await this.userModel.findOne({ email: dto.email.toLowerCase() }).lean();
    if (existing) {
      throw new ConflictException(`Email "${dto.email}" is already registered.`);
    }

    const password_hash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const owner = await this.userModel.create({
      name: dto.name,
      email: dto.email.toLowerCase(),
      password: password_hash,
      phone: dto.phone,
      role: 'owner',
      room_id: null,
    });

    return {
      message: 'Owner account created successfully.',
      owner: { _id: owner._id, name: owner.name, email: owner.email },
    };
  }

  // ── REGISTER TENANT (Owner only) ──────────────────────────────────────
  // The calling Owner can only assign tenants to their OWN rooms.
  // Room ownership check happens here (not in the controller).
  async registerTenant(dto: RegisterTenantDto, ownerId: string) {
    const existing = await this.userModel.findOne({ email: dto.email.toLowerCase() }).lean();
    if (existing) {
      throw new ConflictException(`Email "${dto.email}" is already registered.`);
    }

    if (!Types.ObjectId.isValid(dto.room_id)) {
      throw new BadRequestException('Invalid room_id format.');
    }

    // Dynamic import to avoid circular dependency with RoomsModule
    // In production, inject RoomsService instead.
    //const Room = this.userModel.db.model('Room');
    //const room = await Room.findById(dto.room_id).lean();

    const room = await this.roomModel.findById(dto.room_id).lean();

    if (!room) {
      throw new NotFoundException(`Room ${dto.room_id} not found.`);
    }
    if ((room as any).owner_id.toString() !== ownerId) {
      throw new ForbiddenException('You can only assign tenants to your own rooms.');
    }
    if ((room as any).status === 'occupied') {
      throw new ConflictException('Room is already occupied.');
    }

    const password_hash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const roomObjectId = new Types.ObjectId(dto.room_id);

    const tenant = await this.userModel.create({
      name: dto.name,
      email: dto.email.toLowerCase(),
      password: password_hash,
      phone: dto.phone,
      role: 'tenant',
      room_id: roomObjectId,
    });

    // Update room: assign tenant + mark as occupied
    // await Room.findByIdAndUpdate(dto.room_id, {
    //   $set: { current_tenant_id: tenant._id, status: 'occupied' },
    // });

    await this.roomModel.findByIdAndUpdate(dto.room_id, {
      $set: { current_tenant_id: tenant._id, status: 'occupied' },
    });

    return {
      message: 'Tenant registered and assigned to room successfully.',
      tenant: { _id: tenant._id, name: tenant.name, email: tenant.email, room_id: dto.room_id },
    };
  }
}