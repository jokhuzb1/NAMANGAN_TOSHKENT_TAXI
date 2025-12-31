const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
    driverId: { type: Number, required: true }, // Telegram ID of driver
    driverName: { type: String },
    carModel: { type: String },
    price: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
});

const rideRequestSchema = new mongoose.Schema({
    passengerId: { type: Number, required: true }, // Telegram ID
    from: { type: String, required: true }, // e.g., 'Tashkent'
    to: { type: String, required: true }, // e.g., 'Namangan'
    time: { type: String, required: true }, // e.g., 'Hozir', '14:00'
    seats: { type: Number, required: true },
    seatType: { type: String, default: 'any' }, // 'front', 'back', 'any'
    type: { type: String, enum: ['passenger', 'parcel'], default: 'passenger' },
    packageType: { type: String }, // 'document', 'load', 'box', 'other'
    district: { type: String }, // e.g. "Yunusobod", "Parkent"
    voiceId: { type: String }, // Telegram Voice File ID
    status: { type: String, enum: ['searching', 'negotiating', 'matched', 'completed', 'cancelled'], default: 'searching' },
    offers: [offerSchema],
    blockedDrivers: [{
        driverId: Number,
        count: { type: Number, default: 0 },
        blockedUntil: Date
    }],
    broadcastMessages: [{
        driverId: Number,
        messageId: Number
    }],
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('RideRequest', rideRequestSchema);
