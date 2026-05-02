import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from '../common/schemas';

// ── Mock user fixture ──────────────────────────────────────────────────────
const mockUser = {
  _id: '665f000000000000000000aa',
  name: 'Test Owner',
  email: 'owner@example.com',
  password: bcrypt.hashSync('password123', 10),
  role: 'owner',
  room_id: null,
};

// ── Mongoose model mock ────────────────────────────────────────────────────
const userModelMock = {
  findOne: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  db: { model: jest.fn() },
};

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: userModelMock },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('mock.jwt.token') },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);

    jest.clearAllMocks();
  });

  // ── login ────────────────────────────────────────────────────────────────
  describe('login()', () => {
    it('returns access_token on valid credentials', async () => {
      userModelMock.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockUser) }),
      });

      const result = await service.login({ email: mockUser.email, password: 'password123' });

      expect(result.access_token).toBe('mock.jwt.token');
      expect(result.role).toBe('owner');
    });

    it('throws UnauthorizedException for unknown email', async () => {
      userModelMock.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      });

      await expect(
        service.login({ email: 'nobody@example.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      userModelMock.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockUser) }),
      });

      await expect(
        service.login({ email: mockUser.email, password: 'wrongPassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── inviteOwner ──────────────────────────────────────────────────────────
  describe('inviteOwner()', () => {
    it('creates an owner and returns summary', async () => {
      userModelMock.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      userModelMock.create.mockResolvedValue({ _id: 'new-id', name: 'New Owner', email: 'new@owner.com' });

      const result = await service.inviteOwner({
        name: 'New Owner',
        email: 'new@owner.com',
        password: 'pass1234',
        phone: '0912345678',
      });

      expect(result.message).toContain('successfully');
    });

    it('throws ConflictException if email already exists', async () => {
      userModelMock.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockUser) });

      await expect(
        service.inviteOwner({
          name: 'Duplicate',
          email: mockUser.email,
          password: 'pass1234',
          phone: '0912345678',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});