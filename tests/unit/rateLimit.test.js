const { PrismaClient } = require('@prisma/client');
const { rateLimit, strictRateLimit, standardRateLimit, lenientRateLimit } = require('../../server/middleware/rateLimit');

describe('Rate Limiting Middleware', () => {
  let mockPrisma;
  let req;
  let res;
  let next;

  beforeEach(() => {
    mockPrisma = new PrismaClient();
    req = {
      ip: '127.0.0.1',
      originalUrl: '/api/auth/login',
      user: null
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

  describe('rateLimit function', () => {
    it('should allow request when under limit', async () => {
      const rateLimitMiddleware = rateLimit(5, 15);
      
      mockPrisma.rateLimit.findUnique.mockResolvedValue({
        attempts: 2,
        resetAt: new Date(Date.now() + 15 * 60 * 1000)
      });

      await rateLimitMiddleware(req, res, next);

      expect(mockPrisma.rateLimit.update).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should block request when over limit', async () => {
      const rateLimitMiddleware = rateLimit(5, 15);
      
      mockPrisma.rateLimit.findUnique.mockResolvedValue({
        attempts: 5,
        resetAt: new Date(Date.now() + 15 * 60 * 1000)
      });

      await rateLimitMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Too many requests',
        message: expect.stringContaining('Rate limit exceeded'),
        retryAfter: expect.any(Number)
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should create new rate limit record if none exists', async () => {
      const rateLimitMiddleware = rateLimit(5, 15);
      
      mockPrisma.rateLimit.findUnique.mockResolvedValue(null);
      mockPrisma.rateLimit.create.mockResolvedValue({
        attempts: 0,
        resetAt: new Date()
      });

      await rateLimitMiddleware(req, res, next);

      expect(mockPrisma.rateLimit.create).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should reset attempts when window expires', async () => {
      const rateLimitMiddleware = rateLimit(5, 15);
      
      mockPrisma.rateLimit.findUnique.mockResolvedValue({
        attempts: 5,
        resetAt: new Date(Date.now() - 1000) // Expired
      });

      await rateLimitMiddleware(req, res, next);

      expect(mockPrisma.rateLimit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attempts: 0
          })
        })
      );
      expect(next).toHaveBeenCalled();
    });

    it('should use user ID when available', async () => {
      const rateLimitMiddleware = rateLimit(5, 15, true);
      
      req.user = { id: 'user-123' };
      mockPrisma.rateLimit.findUnique.mockResolvedValue(null);
      mockPrisma.rateLimit.create.mockResolvedValue({
        attempts: 0,
        resetAt: new Date()
      });

      await rateLimitMiddleware(req, res, next);

      expect(mockPrisma.rateLimit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            key: 'user_user-123'
          })
        })
      );
    });

    it('should handle missing IP address gracefully', async () => {
      const rateLimitMiddleware = rateLimit(5, 15);
      
      req.ip = undefined;
      req.connection = { remoteAddress: '192.168.1.1' };
      mockPrisma.rateLimit.findUnique.mockResolvedValue(null);
      mockPrisma.rateLimit.create.mockResolvedValue({
        attempts: 0,
        resetAt: new Date()
      });

      await rateLimitMiddleware(req, res, next);

      expect(mockPrisma.rateLimit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            key: 'ip_192.168.1.1'
          })
        })
      );
    });

    it('should add rate limit info to request', async () => {
      const rateLimitMiddleware = rateLimit(5, 15);
      
      mockPrisma.rateLimit.findUnique.mockResolvedValue({
        attempts: 2,
        resetAt: new Date(Date.now() + 15 * 60 * 1000)
      });

      await rateLimitMiddleware(req, res, next);

      expect(req.rateLimit).toBeDefined();
      expect(req.rateLimit.remaining).toBe(2); // 5 - 2 - 1 (current request)
      expect(req.rateLimit.resetTime).toBeInstanceOf(Date);
    });

    it('should handle database errors gracefully', async () => {
      const rateLimitMiddleware = rateLimit(5, 15);
      
      mockPrisma.rateLimit.findUnique.mockRejectedValue(new Error('Database error'));

      await rateLimitMiddleware(req, res, next);

      // Should allow request to proceed when rate limiting fails
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('predefined rate limit configurations', () => {
    it('should use strict rate limit (3 attempts per 15 minutes)', async () => {
      mockPrisma.rateLimit.findUnique.mockResolvedValue({
        attempts: 3,
        resetAt: new Date(Date.now() + 15 * 60 * 1000)
      });

      await strictRateLimit(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Too many requests',
        message: expect.stringContaining('Rate limit exceeded'),
        retryAfter: expect.any(Number)
      });
    });

    it('should use standard rate limit (5 attempts per 15 minutes)', async () => {
      mockPrisma.rateLimit.findUnique.mockResolvedValue({
        attempts: 4,
        resetAt: new Date(Date.now() + 15 * 60 * 1000)
      });

      await standardRateLimit(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should use lenient rate limit (10 attempts per 15 minutes)', async () => {
      mockPrisma.rateLimit.findUnique.mockResolvedValue({
        attempts: 9,
        resetAt: new Date(Date.now() + 15 * 60 * 1000)
      });

      await lenientRateLimit(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('rate limit key generation', () => {
    it('should generate IP-based key correctly', async () => {
      const rateLimitMiddleware = rateLimit(5, 15);
      
      req.ip = '192.168.1.100';
      mockPrisma.rateLimit.findUnique.mockResolvedValue(null);
      mockPrisma.rateLimit.create.mockResolvedValue({
        attempts: 0,
        resetAt: new Date()
      });

      await rateLimitMiddleware(req, res, next);

      expect(mockPrisma.rateLimit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            key: 'ip_192.168.1.100'
          })
        })
      );
    });

    it('should generate user-based key correctly', async () => {
      const rateLimitMiddleware = rateLimit(5, 15, true);
      
      req.user = { id: 'user-456' };
      mockPrisma.rateLimit.findUnique.mockResolvedValue(null);
      mockPrisma.rateLimit.create.mockResolvedValue({
        attempts: 0,
        resetAt: new Date()
      });

      await rateLimitMiddleware(req, res, next);

      expect(mockPrisma.rateLimit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            key: 'user_user-456'
          })
        })
      );
    });
  });

  describe('rate limit expiration calculation', () => {
    it('should calculate remaining time correctly', async () => {
      const rateLimitMiddleware = rateLimit(5, 15);
      
      const resetTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
      mockPrisma.rateLimit.findUnique.mockResolvedValue({
        attempts: 5,
        resetAt: resetTime
      });

      await rateLimitMiddleware(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        error: 'Too many requests',
        message: expect.stringContaining('10 minutes'),
        retryAfter: 600 // 10 minutes in seconds
      });
    });

    it('should handle expired reset time', async () => {
      const rateLimitMiddleware = rateLimit(5, 15);
      
      const resetTime = new Date(Date.now() - 1000); // 1 second ago
      mockPrisma.rateLimit.findUnique.mockResolvedValue({
        attempts: 5,
        resetAt: resetTime
      });

      await rateLimitMiddleware(req, res, next);

      // Should reset attempts and allow request
      expect(mockPrisma.rateLimit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attempts: 0
          })
        })
      );
      expect(next).toHaveBeenCalled();
    });
  });
});
