const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    name: { type: String },
    addedBy: { type: Number }, // Telegram ID of the admin who added this user, if applicable
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Admin', adminSchema);
