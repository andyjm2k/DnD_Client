const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

/**
 * Session management service
 */
class SessionService {
  /**
   * Create a new session for a user
   */
  async createSession(userId, deviceInfo = {}, options = {}) {
    try {
      const {
        ipAddress,
        userAgent,
        expiresIn = 24 * 60 * 60 * 1000 // 24 hours default
      } = options;

      // Generate unique session token
      const token = crypto.randomBytes(64).toString('hex');
      const expiresAt = new Date(Date.now() + expiresIn);

      const session = await prisma.userSession.create({
        data: {
          userId,
          token,
          deviceInfo: JSON.stringify(deviceInfo),
          ipAddress: ipAddress || 'unknown',
          userAgent: userAgent || 'unknown',
          expiresAt
        }
      });

      return {
        id: session.id,
        token,
        expiresAt
      };
    } catch (error) {
      console.error('Error creating session:', error);
      throw new Error('Failed to create session');
    }
  }

  /**
   * Validate a session token
   */
  async validateSession(token) {
    try {
      const session = await prisma.userSession.findUnique({
        where: { token },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              displayName: true,
              avatar: true,
              roles: true,
              emailVerified: true,
              accountStatus: true
            }
          }
        }
      });

      if (!session) {
        return null;
      }

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        await this.invalidateSession(token);
        return null;
      }

      // Check if user account is active
      if (session.user.accountStatus !== 'active') {
        return null;
      }

      // Update last activity
      await prisma.userSession.update({
        where: { id: session.id },
        data: { lastActivityAt: new Date() }
      });

      return {
        session: {
          id: session.id,
          token: session.token,
          expiresAt: session.expiresAt,
          deviceInfo: JSON.parse(session.deviceInfo),
          ipAddress: session.ipAddress,
          userAgent: session.userAgent
        },
        user: session.user
      };
    } catch (error) {
      console.error('Error validating session:', error);
      return null;
    }
  }

  /**
   * Invalidate a specific session
   */
  async invalidateSession(token) {
    try {
      await prisma.userSession.delete({
        where: { token }
      });
      return true;
    } catch (error) {
      console.error('Error invalidating session:', error);
      return false;
    }
  }

  /**
   * Invalidate all sessions for a user (logout from all devices)
   */
  async invalidateAllUserSessions(userId) {
    try {
      await prisma.userSession.deleteMany({
        where: { userId }
      });
      return true;
    } catch (error) {
      console.error('Error invalidating user sessions:', error);
      return false;
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId) {
    try {
      const sessions = await prisma.userSession.findMany({
        where: {
          userId,
          expiresAt: {
            gt: new Date()
          }
        },
        select: {
          id: true,
          deviceInfo: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          lastActivityAt: true,
          expiresAt: true
        },
        orderBy: {
          lastActivityAt: 'desc'
        }
      });

      return sessions.map(session => ({
        ...session,
        deviceInfo: JSON.parse(session.deviceInfo)
      }));
    } catch (error) {
      console.error('Error getting user sessions:', error);
      return [];
    }
  }

  /**
   * Clean up expired sessions (should be run periodically)
   */
  async cleanupExpiredSessions() {
    try {
      const result = await prisma.userSession.deleteMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        }
      });

      console.log(`Cleaned up ${result.count} expired sessions`);
      return result.count;
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
      return 0;
    }
  }

  /**
   * Extend session expiration
   */
  async extendSession(token, additionalTime = 24 * 60 * 60 * 1000) {
    try {
      const newExpiresAt = new Date(Date.now() + additionalTime);

      const session = await prisma.userSession.update({
        where: { token },
        data: {
          expiresAt: newExpiresAt,
          lastActivityAt: new Date()
        }
      });

      return {
        id: session.id,
        token: session.token,
        expiresAt: session.expiresAt
      };
    } catch (error) {
      console.error('Error extending session:', error);
      return null;
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(userId) {
    try {
      const [activeCount, totalCount] = await Promise.all([
        prisma.userSession.count({
          where: {
            userId,
            expiresAt: { gt: new Date() }
          }
        }),
        prisma.userSession.count({
          where: { userId }
        })
      ]);

      return {
        activeSessions: activeCount,
        totalSessions: totalCount
      };
    } catch (error) {
      console.error('Error getting session stats:', error);
      return {
        activeSessions: 0,
        totalSessions: 0
      };
    }
  }
}

module.exports = new SessionService();
