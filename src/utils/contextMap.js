// Simple in-memory storage for passing data between handlers and conversations
// This avoids ctx.session issues within conversation entry
// Includes TTL-based auto-cleanup to prevent memory leaks

const contextMap = new Map();
const TTL_MS = 30 * 60 * 1000; // 30 minutes TTL

// Set with auto-expiry
function setWithTTL(userId, value) {
    contextMap.set(userId, { value, timestamp: Date.now() });
}

// Get value (returns undefined if expired)
function getWithTTL(userId) {
    const entry = contextMap.get(userId);
    if (!entry) return undefined;

    // Check if expired
    if (Date.now() - entry.timestamp > TTL_MS) {
        contextMap.delete(userId);
        return undefined;
    }
    return entry.value;
}

// Cleanup old entries (run periodically)
function cleanupExpired() {
    const now = Date.now();
    for (const [userId, entry] of contextMap.entries()) {
        if (now - entry.timestamp > TTL_MS) {
            contextMap.delete(userId);
        }
    }
}

// Run cleanup every 10 minutes
setInterval(cleanupExpired, 10 * 60 * 1000);

// Manual delete
function deleteEntry(userId) {
    contextMap.delete(userId);
}

module.exports = {
    contextMap,
    setWithTTL,
    getWithTTL,
    deleteEntry,
    cleanupExpired
};
