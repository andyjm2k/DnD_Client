const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const auth = async (req, res, next) => {
  try {
    // Log authentication attempt for debugging
    console.log('=== Auth middleware called ===');
    console.log('Request path:', req.path);
    console.log('Authorization header:', req.header('Authorization') ? 'Present' : 'Missing');
    
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      console.log('No token provided, returning 401');
      throw new Error();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        username: true,
        email: true,
        roles: true,
        displayName: true,
        avatar: true
      }
    });

    if (!user) {
      console.log('User not found, returning 401');
      throw new Error();
    }

    // Update last active timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() }
    });

    console.log('Authentication successful for user:', user.username);
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    console.log('Authentication failed:', error.message);
    res.status(401).json({ error: 'Please authenticate.' });
  }
};

module.exports = auth; 