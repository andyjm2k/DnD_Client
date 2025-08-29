const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Rate limiting middleware for authentication endpoints
 * @param {number} maxAttempts - Maximum attempts allowed
 * @param {number} windowMinutes - Time window in minutes
 * @param {boolean} useUserId - Whether to use user ID instead of IP
 * @returns {Function} Express middleware function
 */
const rateLimit = (maxAttempts = 5, windowMinutes = 15, useUserId = false) => {
  return async (req, res, next) => {
    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() - (windowMinutes * 60 * 1000));

      // Determine the key for rate limiting
      let key;
      if (useUserId && req.user?.id) {
        key = `user_${req.user.id}`;
      } else {
        key = `ip_${req.ip || req.connection.remoteAddress || req.socket.remoteAddress}`;
      }

      const endpoint = req.originalUrl || req.url;

      // Get or create rate limit record
      let rateLimitRecord = await prisma.rateLimit.findUnique({
        where: { key }
      });

      if (!rateLimitRecord) {
        rateLimitRecord = await prisma.rateLimit.create({
          data: {
            key,
            endpoint,
            attempts: 0,
            resetAt: new Date(now.getTime() + (windowMinutes * 60 * 1000))
          }
        });
      }

      // Check if window has expired and reset if needed
      if (now > rateLimitRecord.resetAt) {
        rateLimitRecord = await prisma.rateLimit.update({
          where: { key },
          data: {
            attempts: 0,
            resetAt: new Date(now.getTime() + (windowMinutes * 60 * 1000))
          }
        });
      }

      // Check if limit exceeded
      if (rateLimitRecord.attempts >= maxAttempts) {
        const resetTime = Math.ceil((rateLimitRecord.resetAt - now) / 1000 / 60); // minutes

        return res.status(429).json({
          error: 'Too many requests',
          message: `Rate limit exceeded. Try again in ${resetTime} minutes.`,
          retryAfter: resetTime * 60 // seconds
        });
      }

      // Increment attempts
      await prisma.rateLimit.update({
        where: { key },
        data: {
          attempts: rateLimitRecord.attempts + 1,
          updatedAt: now
        }
      });

      // Add rate limit info to request for potential use in response headers
      req.rateLimit = {
        remaining: maxAttempts - rateLimitRecord.attempts - 1,
        resetTime: rateLimitRecord.resetAt
      };

      next();
    } catch (error) {
      console.error('Rate limiting error:', error);
      // If rate limiting fails, allow the request to proceed
      next();
    }
  };
};

/**
 * Stricter rate limiting for sensitive operations
 */
const strictRateLimit = rateLimit(3, 15); // 3 attempts per 15 minutes

/**
 * Standard rate limiting for general auth operations
 */
const standardRateLimit = rateLimit(5, 15); // 5 attempts per 15 minutes

/**
 * Lenient rate limiting for non-sensitive operations
 */
const lenientRateLimit = rateLimit(10, 15); // 10 attempts per 15 minutes

module.exports = {
  rateLimit,
  strictRateLimit,
  standardRateLimit,
  lenientRateLimit
};
