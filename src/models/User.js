const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    role: { type: String, enum: ['passenger', 'driver', 'none'], default: 'none' },
    name: { type: String },
    username: { type: String }, // Telegram Username
    phone: { type: String },

    // Driver specific fields
    carDetails: {
        brand: { type: String },
        model: { type: String },
        color: { type: String },
        year: { type: String },
        seats: { type: Number }
    },
    carNumber: { type: String }, // License Plate

    // Image Metadata Only
    selfie: {
        telegramFileId: String,
        telegramFileUniqueId: String,
        uploadedAt: Date
    },
    carImages: [{
        telegramFileId: String,
        telegramFileUniqueId: String,
        uploadedAt: Date
    }],

    // Legacy field for backward compatibility if needed, but new flow uses carDetails.model
    carModel: { type: String },

    isOnline: { type: Boolean, default: false },
    activeRoute: { type: String, enum: ['tash_nam', 'nam_tash', 'none'], default: 'none' },
    status: { type: String, enum: ['pending_verification', 'approved', 'rejected'], default: 'pending_verification' },
    isApproved: { type: Boolean, default: false }, // Synced with status
    createdAt: { type: Date, default: Date.now },

    // Registration Progress Tracking
    registrationStep: { type: Number, default: 0 },
    registrationData: { type: Object, default: {} }
});

module.exports = mongoose.model('User', userSchema);
