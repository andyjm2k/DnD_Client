const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const auth = require('../../server/middleware/auth');

describe('Authentication Middleware', () => {
  let mockPrisma;
  let req;
  let res;
  let next;

  beforeEach(() => {
    mockPrisma = new PrismaClient();
    req = {
      header: jest.fn(),
      user: null,
      token: null
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('auth middleware', () => {
    it('should authenticate user with valid token', async () => {
      const testUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        roles: 'player',
        displayName: 'Test User',
        avatar: null
      };

      const token = jwt.sign({ id: testUser.id }, process.env.JWT_SECRET);
      
      req.header.mockReturnValue(`Bearer ${token}`);
      mockPrisma.user.findUnique.mockResolvedValue(testUser);
      mockPrisma.user.update.mockResolvedValue({});

      await auth(req, res, next);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: testUser.id },
        select: {
          id: true,
          username: true,
          email: true,
          roles: true,
          displayName: true,
          avatar: true
        }
      });
      expect(req.user).toEqual(testUser);
      expect(req.token).toBe(token);
      expect(next).toHaveBeenCalled();
    });

    it('should return 401 when no token provided', async () => {
      req.header.mockReturnValue(undefined);

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Please authenticate.' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when token is invalid', async () => {
      req.header.mockReturnValue('Bearer invalid-token');

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Please authenticate.' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when user not found', async () => {
      const token = jwt.sign({ id: 'non-existent' }, process.env.JWT_SECRET);
      
      req.header.mockReturnValue(`Bearer ${token}`);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Please authenticate.' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should update last active timestamp', async () => {
      const testUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        roles: 'player',
        displayName: 'Test User',
        avatar: null
      };

      const token = jwt.sign({ id: testUser.id }, process.env.JWT_SECRET);
      
      req.header.mockReturnValue(`Bearer ${token}`);
      mockPrisma.user.findUnique.mockResolvedValue(testUser);
      mockPrisma.user.update.mockResolvedValue({});

      await auth(req, res, next);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: testUser.id },
        data: { lastActive: expect.any(Date) }
      });
    });
  });
});

describe('Password Hashing Utilities', () => {
  describe('bcrypt password hashing', () => {
    it('should hash password correctly', async () => {
      const password = 'testPassword123';
      const hashedPassword = await bcrypt.hash(password, 10);

      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword.length).toBeGreaterThan(20);
    });

    it('should verify password correctly', async () => {
      const password = 'testPassword123';
      const hashedPassword = await bcrypt.hash(password, 10);

      const isValid = await bcrypt.compare(password, hashedPassword);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'testPassword123';
      const wrongPassword = 'wrongPassword123';
      const hashedPassword = await bcrypt.hash(password, 10);

      const isValid = await bcrypt.compare(wrongPassword, hashedPassword);
      expect(isValid).toBe(false);
    });

    it('should handle different salt rounds', async () => {
      const password = 'testPassword123';
      const hash1 = await bcrypt.hash(password, 10);
      const hash2 = await bcrypt.hash(password, 12);

      expect(hash1).not.toBe(hash2);
      
      const isValid1 = await bcrypt.compare(password, hash1);
      const isValid2 = await bcrypt.compare(password, hash2);
      
      expect(isValid1).toBe(true);
      expect(isValid2).toBe(true);
    });
  });
});

describe('JWT Token Management', () => {
  describe('token generation', () => {
    it('should generate valid JWT token', () => {
      const payload = { id: 'user-123', email: 'test@example.com' };
      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should verify valid JWT token', () => {
      const payload = { id: 'user-123', email: 'test@example.com' };
      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      expect(decoded.id).toBe(payload.id);
      expect(decoded.email).toBe(payload.email);
    });

    it('should reject invalid JWT token', () => {
      const invalidToken = 'invalid.jwt.token';

      expect(() => {
        jwt.verify(invalidToken, process.env.JWT_SECRET);
      }).toThrow();
    });

    it('should reject token with wrong secret', () => {
      const payload = { id: 'user-123', email: 'test@example.com' };
      const token = jwt.sign(payload, 'wrong-secret', { expiresIn: '1h' });

      expect(() => {
        jwt.verify(token, process.env.JWT_SECRET);
      }).toThrow();
    });

    it('should handle expired tokens', () => {
      const payload = { id: 'user-123', email: 'test@example.com' };
      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1ms' });

      // Wait for token to expire
      setTimeout(() => {
        expect(() => {
          jwt.verify(token, process.env.JWT_SECRET);
        }).toThrow('jwt expired');
      }, 10);
    });
  });
});
