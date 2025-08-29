const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const { standardRateLimit, strictRateLimit } = require('../middleware/rateLimit');
const {
  validateRegistration,
  validateLogin,
  validatePasswordChange,
  validateProfileUpdate,
  validatePasswordResetRequest,
  validatePasswordReset,
  validateEmailVerification,
  sanitizeInput,
  securityHeaders
} = require('../middleware/validation');
const sessionService = require('../services/sessionService');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * Helper function to log audit events
 */
const logAuditEvent = async (userId, action, resource, resourceId, details, ipAddress, userAgent, success = true, errorMessage = null) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        resourceId,
        details: details ? JSON.stringify(details) : null,
        ipAddress,
        userAgent,
        success,
        errorMessage
      }
    });
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
};

// Register a new user
router.post('/register', securityHeaders, sanitizeInput, standardRateLimit, validateRegistration, async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { username }
        ]
      }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Generate email verification token
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create new user
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: await bcrypt.hash(password, 10),
        displayName: displayName || username,
        emailVerificationToken,
        emailVerificationExpires
      }
    });

    // TODO: Send verification email
    // For now, we'll log the verification token for development
    console.log(`Email verification token for ${email}: ${emailVerificationToken}`);

    // Generate JWT token (but don't log user in until email is verified)
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE
    });

    res.status(201).json({
      message: 'User created successfully. Please check your email to verify your account.',
      token, // Still providing token for immediate access, but ideally should require verification
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Error creating user' });
  }
});

// Login user
router.post('/login', securityHeaders, sanitizeInput, standardRateLimit, validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || '';

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      // Log failed login attempt for non-existent user
      await logAuditEvent(null, 'login_failed', null, null, {
        reason: 'user_not_found',
        email,
        ipAddress: clientIP,
        userAgent
      }, clientIP, userAgent, false, 'User not found');

      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if account is locked
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      const remainingTime = Math.ceil((user.lockoutUntil - new Date()) / 1000 / 60); // minutes
      return res.status(423).json({
        error: 'Account temporarily locked',
        message: `Too many failed attempts. Try again in ${remainingTime} minutes.`
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Increment failed login attempts
      const newFailedAttempts = user.failedLoginAttempts + 1;
      const shouldLock = newFailedAttempts >= 5; // Lock after 5 failed attempts

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newFailedAttempts,
          lockoutUntil: shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : null // 15 minutes lockout
        }
      });

      // Log failed login attempt
      await logAuditEvent(user.id, 'login_failed', null, null, {
        reason: 'invalid_password',
        email,
        failedAttempts: newFailedAttempts,
        ipAddress: clientIP,
        userAgent
      }, clientIP, userAgent, false, 'Invalid password');

      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if account is active
    if (user.accountStatus !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }

    // Successful login - reset failed attempts and update login info
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockoutUntil: null,
        lastLoginAt: new Date(),
        loginCount: user.loginCount + 1
      }
    });

    // Log successful login
    await logAuditEvent(user.id, 'login_success', null, null, {
      email,
      ipAddress: clientIP,
      userAgent
    }, clientIP, userAgent, true);

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        roles: user.roles
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRE || '24h'
      }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        roles: user.roles,
        emailVerified: user.emailVerified
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error logging in' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        avatar: true,
        bio: true,
        theme: true,
        notifications: true,
        roles: true,
        campaignsCreated: true,
        campaignsPlayed: true,
        charactersCreated: true,
        totalPlayTime: true
      }
    });

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Error fetching user data' });
  }
});

// Update user profile
router.patch('/profile', auth, securityHeaders, sanitizeInput, validateProfileUpdate, async (req, res) => {
  try {
    const allowedUpdates = ['displayName', 'avatar', 'bio', 'theme', 'notifications'];
    const updates = Object.keys(req.body)
      .filter(key => allowedUpdates.includes(key))
      .reduce((obj, key) => {
        obj[key] = req.body[key];
        return obj;
      }, {});

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updates,
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        avatar: true,
        bio: true,
        theme: true,
        notifications: true,
        emailVerified: true
      }
    });

    // Log profile update
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || '';
    await logAuditEvent(req.user.id, 'profile_update', 'user', req.user.id, updates, clientIP, userAgent, true);

    res.json(user);
  } catch (error) {
    console.error('Update profile error:', error);

    // Log failed profile update
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || '';
    await logAuditEvent(req.user.id, 'profile_update', 'user', req.user.id, null, clientIP, userAgent, false, error.message);

    res.status(500).json({ error: 'Error updating profile' });
  }
});

// Change password
router.post('/change-password', auth, securityHeaders, sanitizeInput, strictRateLimit, validatePasswordChange, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || '';

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      // Log failed password change attempt
      await logAuditEvent(req.user.id, 'password_change_failed', 'user', req.user.id, {
        reason: 'incorrect_current_password'
      }, clientIP, userAgent, false, 'Current password is incorrect');

      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        password: await bcrypt.hash(newPassword, 10),
        updatedAt: new Date()
      }
    });

    // Log successful password change
    await logAuditEvent(req.user.id, 'password_change_success', 'user', req.user.id, {
      changedAt: new Date().toISOString()
    }, clientIP, userAgent, true);

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);

    // Log failed password change
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || '';
    await logAuditEvent(req.user.id, 'password_change_failed', 'user', req.user.id, null, clientIP, userAgent, false, error.message);

    res.status(500).json({ error: 'Error changing password' });
  }
});

// Email verification endpoint
router.post('/verify-email', securityHeaders, sanitizeInput, validateEmailVerification, async (req, res) => {
  try {
    const { token } = req.body;

    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpires: {
          gt: new Date()
        }
      }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    // Update user as verified
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null
      }
    });

    // Log email verification
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || '';
    await logAuditEvent(user.id, 'email_verified', 'user', user.id, {
      verifiedAt: new Date().toISOString()
    }, clientIP, userAgent, true);

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Error verifying email' });
  }
});

// Password reset request endpoint
router.post('/forgot-password', securityHeaders, sanitizeInput, standardRateLimit, validatePasswordResetRequest, async (req, res) => {
  try {
    const { email } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || '';

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
    }

    // Generate password reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires
      }
    });

    // Log password reset request
    await logAuditEvent(user.id, 'password_reset_requested', 'user', user.id, {
      requestedAt: new Date().toISOString()
    }, clientIP, userAgent, true);

    // TODO: Send password reset email
    console.log(`Password reset token for ${email}: ${resetToken}`);

    res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: 'Error processing password reset request' });
  }
});

// Password reset endpoint
router.post('/reset-password', securityHeaders, sanitizeInput, validatePasswordReset, async (req, res) => {
  try {
    const { token, password } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || '';

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: {
          gt: new Date()
        }
      }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Update password and clear reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(password, 10),
        passwordResetToken: null,
        passwordResetExpires: null,
        failedLoginAttempts: 0,
        lockoutUntil: null
      }
    });

    // Log password reset
    await logAuditEvent(user.id, 'password_reset_success', 'user', user.id, {
      resetAt: new Date().toISOString()
    }, clientIP, userAgent, true);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Error resetting password' });
  }
});

// Logout endpoint
router.post('/logout', auth, async (req, res) => {
  try {
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || '';

    // Log logout
    await logAuditEvent(req.user.id, 'logout', 'user', req.user.id, {
      loggedOutAt: new Date().toISOString()
    }, clientIP, userAgent, true);

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Error logging out' });
  }
});

// Session management endpoints

// Get user's active sessions
router.get('/sessions', auth, securityHeaders, async (req, res) => {
  try {
    const sessions = await sessionService.getUserSessions(req.user.id);

    // Don't include current session in the list (for logout from other devices)
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const filteredSessions = sessions.filter(session => session.ipAddress !== clientIP);

    res.json({
      sessions: filteredSessions,
      currentSession: {
        ipAddress: clientIP,
        userAgent: req.get('User-Agent') || 'unknown'
      }
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Error fetching sessions' });
  }
});

// Logout from specific session
router.delete('/sessions/:sessionId', auth, securityHeaders, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || '';

    // Find the session to make sure it belongs to the user
    const session = await prisma.userSession.findFirst({
      where: {
        id: sessionId,
        userId: req.user.id
      }
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Invalidate the session
    const success = await sessionService.invalidateSession(session.token);

    if (success) {
      // Log session termination
      await logAuditEvent(req.user.id, 'session_terminated', 'session', sessionId, {
        terminatedAt: new Date().toISOString(),
        sessionIP: session.ipAddress
      }, clientIP, userAgent, true);

      res.json({ message: 'Session terminated successfully' });
    } else {
      res.status(500).json({ error: 'Error terminating session' });
    }
  } catch (error) {
    console.error('Terminate session error:', error);
    res.status(500).json({ error: 'Error terminating session' });
  }
});

// Logout from all sessions (except current)
router.post('/logout-all', auth, securityHeaders, async (req, res) => {
  try {
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || '';

    // Get current session info before invalidating all
    const currentSessionIP = clientIP;

    // Invalidate all sessions for the user
    const success = await sessionService.invalidateAllUserSessions(req.user.id);

    if (success) {
      // Log logout from all devices
      await logAuditEvent(req.user.id, 'logout_all_devices', 'user', req.user.id, {
        loggedOutAt: new Date().toISOString(),
        currentSessionIP
      }, clientIP, userAgent, true);

      res.json({ message: 'Logged out from all devices successfully' });
    } else {
      res.status(500).json({ error: 'Error logging out from all devices' });
    }
  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({ error: 'Error logging out from all devices' });
  }
});

// Get session statistics
router.get('/sessions/stats', auth, securityHeaders, async (req, res) => {
  try {
    const stats = await sessionService.getSessionStats(req.user.id);
    res.json(stats);
  } catch (error) {
    console.error('Get session stats error:', error);
    res.status(500).json({ error: 'Error fetching session statistics' });
  }
});

module.exports = router; 