const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    reviewerId: { type: Number, required: true },
    targetId: { type: Number, required: true },
    rideRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'RideRequest' },
    role: { type: String, enum: ['passenger', 'driver'], required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Review', reviewSchema);
