const sessionService = require('../services/sessionService');

/**
 * Session cleanup job
 * This job should be scheduled to run periodically (e.g., every hour)
 */
async function cleanupExpiredSessions() {
  try {
    console.log('Running session cleanup job...');
    const deletedCount = await sessionService.cleanupExpiredSessions();

    if (deletedCount > 0) {
      console.log(`Session cleanup completed: ${deletedCount} expired sessions removed`);
    } else {
      console.log('Session cleanup completed: No expired sessions found');
    }

    return deletedCount;
  } catch (error) {
    console.error('Session cleanup job failed:', error);
    throw error;
  }
}

/**
 * Schedule session cleanup to run every hour
 */
function scheduleSessionCleanup() {
  // Run cleanup every hour (3600000 milliseconds)
  const CLEANUP_INTERVAL = 60 * 60 * 1000;

  console.log('Scheduling session cleanup job to run every hour');

  setInterval(async () => {
    try {
      await cleanupExpiredSessions();
    } catch (error) {
      console.error('Scheduled session cleanup failed:', error);
    }
  }, CLEANUP_INTERVAL);

  // Also run cleanup immediately on startup
  setTimeout(() => {
    cleanupExpiredSessions().catch(error => {
      console.error('Initial session cleanup failed:', error);
    });
  }, 30000); // Run 30 seconds after startup
}

module.exports = {
  cleanupExpiredSessions,
  scheduleSessionCleanup
};
