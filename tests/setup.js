const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRE = '1h';
process.env.DATABASE_URL = 'file:./test.db';

// Global test utilities
global.testUtils = {
  // Create a test user
  createTestUser: async (prisma, userData = {}) => {
    const defaultUser = {
      username: 'testuser',
      email: 'test@example.com',
      password: await bcrypt.hash('password123', 10),
      displayName: 'Test User',
      emailVerified: true,
      roles: 'player',
      accountStatus: 'active'
    };

    return await prisma.user.create({
      data: { ...defaultUser, ...userData }
    });
  },

  // Generate a valid JWT token for testing
  generateTestToken: (userId) => {
    return jwt.sign(
      { id: userId, email: 'test@example.com', roles: 'player' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  },

  // Create test request object
  createTestRequest: (user = null, body = {}, headers = {}) => {
    const req = {
      body,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      ip: '127.0.0.1',
      get: (name) => headers[name] || 'test-user-agent',
      connection: { remoteAddress: '127.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' }
    };

    if (user) {
      req.user = user;
    }

    return req;
  },

  // Create test response object
  createTestResponse: () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
    return res;
  },

  // Clean up test data
  cleanupTestData: async (prisma) => {
    await prisma.auditLog.deleteMany();
    await prisma.campaignPermission.deleteMany();
    await prisma.userSession.deleteMany();
    await prisma.rateLimit.deleteMany();
    await prisma.user.deleteMany();
  }
};

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
};

// Mock Prisma globally
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn()
    },
    userSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn()
    },
    campaignPermission: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn()
    },
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn()
    },
    rateLimit: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn()
    }
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma)
  };
});
