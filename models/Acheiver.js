const mongoose = require('mongoose');

const achieverSchema = new mongoose.Schema({
    username: { type: String, required: true },
    level: { type: Number, required: true },
    rewards: [{ type: String }],
    earnings: { type: Number, required: true },
    registrationDate: { type: Date, required: true },
    achievedDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Achiever', achieverSchema);