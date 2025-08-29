const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Role-Based Access Control service
 */
class RBACService {
  // Define available roles and their permissions
  static ROLES = {
    OWNER: 'owner',
    DM: 'dm',
    PLAYER: 'player',
    SPECTATOR: 'spectator'
  };

  static PERMISSIONS = {
    // Campaign permissions
    VIEW_CAMPAIGN: 'view_campaign',
    EDIT_CAMPAIGN: 'edit_campaign',
    DELETE_CAMPAIGN: 'delete_campaign',
    MANAGE_PLAYERS: 'manage_players',
    MANAGE_PERMISSIONS: 'manage_permissions',

    // Character permissions
    CREATE_CHARACTER: 'create_character',
    EDIT_CHARACTER: 'edit_character',
    DELETE_CHARACTER: 'delete_character',

    // Game permissions
    ROLL_DICE: 'roll_dice',
    CAST_SPELLS: 'cast_spells',
    MANAGE_COMBAT: 'manage_combat',
    MANAGE_NPCS: 'manage_npcs',

    // Chat permissions
    SEND_MESSAGES: 'send_messages',
    DELETE_MESSAGES: 'delete_messages'
  };

  // Define default permissions for each role
  static ROLE_PERMISSIONS = {
    [this.ROLES.OWNER]: [
      this.PERMISSIONS.VIEW_CAMPAIGN,
      this.PERMISSIONS.EDIT_CAMPAIGN,
      this.PERMISSIONS.DELETE_CAMPAIGN,
      this.PERMISSIONS.MANAGE_PLAYERS,
      this.PERMISSIONS.MANAGE_PERMISSIONS,
      this.PERMISSIONS.CREATE_CHARACTER,
      this.PERMISSIONS.EDIT_CHARACTER,
      this.PERMISSIONS.DELETE_CHARACTER,
      this.PERMISSIONS.ROLL_DICE,
      this.PERMISSIONS.CAST_SPELLS,
      this.PERMISSIONS.MANAGE_COMBAT,
      this.PERMISSIONS.MANAGE_NPCS,
      this.PERMISSIONS.SEND_MESSAGES,
      this.PERMISSIONS.DELETE_MESSAGES
    ],
    [this.ROLES.DM]: [
      this.PERMISSIONS.VIEW_CAMPAIGN,
      this.PERMISSIONS.EDIT_CAMPAIGN,
      this.PERMISSIONS.MANAGE_PLAYERS,
      this.PERMISSIONS.CREATE_CHARACTER,
      this.PERMISSIONS.EDIT_CHARACTER,
      this.PERMISSIONS.ROLL_DICE,
      this.PERMISSIONS.CAST_SPELLS,
      this.PERMISSIONS.MANAGE_COMBAT,
      this.PERMISSIONS.MANAGE_NPCS,
      this.PERMISSIONS.SEND_MESSAGES,
      this.PERMISSIONS.DELETE_MESSAGES
    ],
    [this.ROLES.PLAYER]: [
      this.PERMISSIONS.VIEW_CAMPAIGN,
      this.PERMISSIONS.CREATE_CHARACTER,
      this.PERMISSIONS.EDIT_CHARACTER,
      this.PERMISSIONS.ROLL_DICE,
      this.PERMISSIONS.CAST_SPELLS,
      this.PERMISSIONS.SEND_MESSAGES
    ],
    [this.ROLES.SPECTATOR]: [
      this.PERMISSIONS.VIEW_CAMPAIGN,
      this.PERMISSIONS.SEND_MESSAGES
    ]
  };

  /**
   * Assign a role to a user for a specific campaign
   */
  async assignRole(campaignId, userId, role, grantedBy, expiresAt = null) {
    try {
      // Validate role
      if (!Object.values(this.ROLES).includes(role)) {
        throw new Error(`Invalid role: ${role}`);
      }

      // Get default permissions for the role
      const permissions = this.ROLE_PERMISSIONS[role];

      // Check if permission already exists
      const existingPermission = await prisma.campaignPermission.findUnique({
        where: {
          campaignId_userId: {
            campaignId,
            userId
          }
        }
      });

      if (existingPermission) {
        // Update existing permission
        return await prisma.campaignPermission.update({
          where: {
            campaignId_userId: {
              campaignId,
              userId
            }
          },
          data: {
            role,
            permissions: JSON.stringify(permissions),
            grantedBy,
            expiresAt
          }
        });
      } else {
        // Create new permission
        return await prisma.campaignPermission.create({
          data: {
            campaignId,
            userId,
            role,
            permissions: JSON.stringify(permissions),
            grantedBy,
            expiresAt
          }
        });
      }
    } catch (error) {
      console.error('Error assigning role:', error);
      throw new Error('Failed to assign role');
    }
  }

  /**
   * Remove a user's role from a campaign
   */
  async removeRole(campaignId, userId) {
    try {
      return await prisma.campaignPermission.delete({
        where: {
          campaignId_userId: {
            campaignId,
            userId
          }
        }
      });
    } catch (error) {
      console.error('Error removing role:', error);
      throw new Error('Failed to remove role');
    }
  }

  /**
   * Get user's permissions for a specific campaign
   */
  async getUserPermissions(campaignId, userId) {
    try {
      const permission = await prisma.campaignPermission.findUnique({
        where: {
          campaignId_userId: {
            campaignId,
            userId
          }
        }
      });

      if (!permission) {
        return null;
      }

      // Check if permission has expired
      if (permission.expiresAt && permission.expiresAt < new Date()) {
        // Remove expired permission
        await this.removeRole(campaignId, userId);
        return null;
      }

      return {
        role: permission.role,
        permissions: JSON.parse(permission.permissions),
        grantedBy: permission.grantedBy,
        grantedAt: permission.grantedAt,
        expiresAt: permission.expiresAt
      };
    } catch (error) {
      console.error('Error getting user permissions:', error);
      return null;
    }
  }

  /**
   * Check if user has a specific permission for a campaign
   */
  async hasPermission(campaignId, userId, requiredPermission) {
    try {
      const userPermissions = await this.getUserPermissions(campaignId, userId);

      if (!userPermissions) {
        return false;
      }

      return userPermissions.permissions.includes(requiredPermission);
    } catch (error) {
      console.error('Error checking permission:', error);
      return false;
    }
  }

  /**
   * Check if user has any of the required permissions for a campaign
   */
  async hasAnyPermission(campaignId, userId, requiredPermissions) {
    try {
      const userPermissions = await this.getUserPermissions(campaignId, userId);

      if (!userPermissions) {
        return false;
      }

      return requiredPermissions.some(permission =>
        userPermissions.permissions.includes(permission)
      );
    } catch (error) {
      console.error('Error checking permissions:', error);
      return false;
    }
  }

  /**
   * Check if user has all of the required permissions for a campaign
   */
  async hasAllPermissions(campaignId, userId, requiredPermissions) {
    try {
      const userPermissions = await this.getUserPermissions(campaignId, userId);

      if (!userPermissions) {
        return false;
      }

      return requiredPermissions.every(permission =>
        userPermissions.permissions.includes(permission)
      );
    } catch (error) {
      console.error('Error checking permissions:', error);
      return false;
    }
  }

  /**
   * Get all users with permissions for a campaign
   */
  async getCampaignUsers(campaignId) {
    try {
      const permissions = await prisma.campaignPermission.findMany({
        where: { campaignId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true,
              email: true
            }
          }
        }
      });

      return permissions.map(permission => ({
        user: permission.user,
        role: permission.role,
        permissions: JSON.parse(permission.permissions),
        grantedBy: permission.grantedBy,
        grantedAt: permission.grantedAt,
        expiresAt: permission.expiresAt
      }));
    } catch (error) {
      console.error('Error getting campaign users:', error);
      return [];
    }
  }

  /**
   * Get all campaigns where user has a specific role
   */
  async getUserCampaignsByRole(userId, role) {
    try {
      const permissions = await prisma.campaignPermission.findMany({
        where: {
          userId,
          role
        },
        include: {
          campaign: {
            select: {
              id: true,
              title: true,
              description: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      return permissions.map(permission => ({
        campaign: permission.campaign,
        role: permission.role,
        permissions: JSON.parse(permission.permissions),
        grantedAt: permission.grantedAt,
        expiresAt: permission.expiresAt
      }));
    } catch (error) {
      console.error('Error getting user campaigns by role:', error);
      return [];
    }
  }

  /**
   * Transfer campaign ownership to another user
   */
  async transferOwnership(campaignId, currentOwnerId, newOwnerId) {
    try {
      // Verify current user is the owner
      const currentOwnerPermission = await this.getUserPermissions(campaignId, currentOwnerId);
      if (!currentOwnerPermission || currentOwnerPermission.role !== this.ROLES.OWNER) {
        throw new Error('Current user is not the campaign owner');
      }

      // Assign owner role to new user
      await this.assignRole(campaignId, newOwnerId, this.ROLES.OWNER, currentOwnerId);

      // Change current owner to DM role
      await this.assignRole(campaignId, currentOwnerId, this.ROLES.DM, currentOwnerId);

      return true;
    } catch (error) {
      console.error('Error transferring ownership:', error);
      throw new Error('Failed to transfer ownership');
    }
  }

  /**
   * Create middleware for checking permissions
   */
  createPermissionMiddleware(requiredPermissions, requireAll = false) {
    return async (req, res, next) => {
      try {
        const campaignId = req.params.campaignId || req.body.campaignId;
        const userId = req.user.id;

        if (!campaignId) {
          return res.status(400).json({ error: 'Campaign ID is required' });
        }

        let hasAccess = false;

        if (requireAll) {
          hasAccess = await this.hasAllPermissions(campaignId, userId, requiredPermissions);
        } else {
          hasAccess = await this.hasAnyPermission(campaignId, userId, requiredPermissions);
        }

        if (!hasAccess) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }

        // Add user's permissions to request for use in route handlers
        req.userPermissions = await this.getUserPermissions(campaignId, userId);

        next();
      } catch (error) {
        console.error('Permission middleware error:', error);
        res.status(500).json({ error: 'Permission check failed' });
      }
    };
  }

  /**
   * Clean up expired permissions (should be run periodically)
   */
  async cleanupExpiredPermissions() {
    try {
      const result = await prisma.campaignPermission.deleteMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        }
      });

      console.log(`Cleaned up ${result.count} expired permissions`);
      return result.count;
    } catch (error) {
      console.error('Error cleaning up expired permissions:', error);
      return 0;
    }
  }
}

module.exports = new RBACService();
