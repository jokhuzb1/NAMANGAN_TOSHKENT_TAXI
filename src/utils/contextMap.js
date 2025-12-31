// Simple in-memory storage for passing data between handlers and conversations
// This avoids ctx.session issues within conversation entry
const contextMap = new Map();

module.exports = { contextMap };
