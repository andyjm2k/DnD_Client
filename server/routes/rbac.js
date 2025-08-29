const express = require('express');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const { securityHeaders } = require('../middleware/validation');
const rbacService = require('../services/rbacService');

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

// Get user's permissions for a campaign
router.get('/campaigns/:campaignId/permissions', auth, securityHeaders, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user.id;

    const permissions = await rbacService.getUserPermissions(campaignId, userId);

    if (!permissions) {
      return res.status(404).json({ error: 'No permissions found for this campaign' });
    }

    res.json(permissions);
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({ error: 'Error fetching permissions' });
  }
});

// Get all users with permissions for a campaign (requires manage_permissions)
router.get('/campaigns/:campaignId/users', auth, securityHeaders,
  rbacService.createPermissionMiddleware([rbacService.constructor.PERMISSIONS.MANAGE_PERMISSIONS]), async (req, res) => {
  try {
    const { campaignId } = req.params;

    const users = await rbacService.getCampaignUsers(campaignId);
    res.json({ users });
  } catch (error) {
    console.error('Get campaign users error:', error);
    res.status(500).json({ error: 'Error fetching campaign users' });
  }
});

// Assign role to user in campaign (requires manage_permissions)
router.post('/campaigns/:campaignId/users/:userId/role', auth, securityHeaders,
  rbacService.createPermissionMiddleware([rbacService.constructor.PERMISSIONS.MANAGE_PERMISSIONS]), async (req, res) => {
  try {
    const { campaignId, userId } = req.params;
    const { role, expiresAt } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || '';

    // Verify the target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Assign the role
    const permission = await rbacService.assignRole(campaignId, userId, role, req.user.id, expiresAt ? new Date(expiresAt) : null);

    // Log the role assignment
    await logAuditEvent(req.user.id, 'role_assigned', 'campaign_permission', permission.id, {
      campaignId,
      targetUserId: userId,
      role,
      expiresAt
    }, clientIP, userAgent, true);

    res.json({
      message: 'Role assigned successfully',
      permission: {
        role: permission.role,
        permissions: JSON.parse(permission.permissions),
        grantedBy: permission.grantedBy,
        grantedAt: permission.grantedAt,
        expiresAt: permission.expiresAt
      }
    });
  } catch (error) {
    console.error('Assign role error:', error);

    // Log failed role assignment
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || '';
    await logAuditEvent(req.user.id, 'role_assigned', 'campaign_permission', null, {
      campaignId: req.params.campaignId,
      targetUserId: req.params.userId,
      role: req.body.role
    }, clientIP, userAgent, false, error.message);

    res.status(500).json({ error: 'Error assigning role' });
  }
});

// Remove user from campaign (requires manage_permissions)
router.delete('/campaigns/:campaignId/users/:userId', auth, securityHeaders,
  rbacService.createPermissionMiddleware([rbacService.constructor.PERMISSIONS.MANAGE_PERMISSIONS]), async (req, res) => {
  try {
    const { campaignId, userId } = req.params;
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || '';

    // Remove the role/permission
    await rbacService.removeRole(campaignId, userId);

    // Log the role removal
    await logAuditEvent(req.user.id, 'role_removed', 'campaign_permission', null, {
      campaignId,
      targetUserId: userId
    }, clientIP, userAgent, true);

    res.json({ message: 'User removed from campaign successfully' });
  } catch (error) {
    console.error('Remove user error:', error);

    // Log failed role removal
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || '';
    await logAuditEvent(req.user.id, 'role_removed', 'campaign_permission', null, {
      campaignId: req.params.campaignId,
      targetUserId: req.params.userId
    }, clientIP, userAgent, false, error.message);

    res.status(500).json({ error: 'Error removing user from campaign' });
  }
});

// Transfer campaign ownership (requires owner role)
router.post('/campaigns/:campaignId/transfer-ownership', auth, securityHeaders,
  rbacService.createPermissionMiddleware([rbacService.constructor.PERMISSIONS.DELETE_CAMPAIGN]), async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { newOwnerId } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || '';

    // Verify the new owner exists
    const newOwner = await prisma.user.findUnique({
      where: { id: newOwnerId }
    });

    if (!newOwner) {
      return res.status(404).json({ error: 'New owner not found' });
    }

    // Transfer ownership
    await rbacService.transferOwnership(campaignId, req.user.id, newOwnerId);

    // Log the ownership transfer
    await logAuditEvent(req.user.id, 'ownership_transferred', 'campaign', campaignId, {
      newOwnerId
    }, clientIP, userAgent, true);

    res.json({ message: 'Campaign ownership transferred successfully' });
  } catch (error) {
    console.error('Transfer ownership error:', error);

    // Log failed ownership transfer
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || '';
    await logAuditEvent(req.user.id, 'ownership_transferred', 'campaign', req.params.campaignId, {
      newOwnerId: req.body.newOwnerId
    }, clientIP, userAgent, false, error.message);

    res.status(500).json({ error: 'Error transferring ownership' });
  }
});

// Get campaigns where user has a specific role
router.get('/users/:userId/campaigns/role/:role', auth, securityHeaders, async (req, res) => {
  try {
    const { userId, role } = req.params;

    // Users can only view their own campaigns
    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const campaigns = await rbacService.getUserCampaignsByRole(userId, role);
    res.json({ campaigns });
  } catch (error) {
    console.error('Get user campaigns by role error:', error);
    res.status(500).json({ error: 'Error fetching campaigns' });
  }
});

// Check if user has specific permission for a campaign
router.post('/campaigns/:campaignId/check-permission', auth, securityHeaders, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { permission, requireAll = false, permissions = [] } = req.body;
    const userId = req.user.id;

    let hasAccess = false;

    if (permission) {
      // Check single permission
      hasAccess = await rbacService.hasPermission(campaignId, userId, permission);
    } else if (permissions.length > 0) {
      // Check multiple permissions
      if (requireAll) {
        hasAccess = await rbacService.hasAllPermissions(campaignId, userId, permissions);
      } else {
        hasAccess = await rbacService.hasAnyPermission(campaignId, userId, permissions);
      }
    }

    res.json({
      hasPermission: hasAccess,
      checkedPermission: permission,
      checkedPermissions: permissions,
      requireAll
    });
  } catch (error) {
    console.error('Check permission error:', error);
    res.status(500).json({ error: 'Error checking permission' });
  }
});

// Get available roles and permissions (public endpoint for UI)
router.get('/roles', securityHeaders, (req, res) => {
  res.json({
    roles: rbacService.constructor.ROLES,
    permissions: rbacService.constructor.PERMISSIONS,
    rolePermissions: rbacService.constructor.ROLE_PERMISSIONS
  });
});

module.exports = router;
