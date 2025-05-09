const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    name: { type: String},
    mobile: { type: String},
    email: { type: String},
    referralCode: { type: String, required: true, unique: true },
    sponsor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    level: { type: Number, default: 1 },
    downlines: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    earnings: { type: Number, default: 0 },
    selfEarning: {
        type: Number, default: 0
    },
    walletBalance: { type: Number, default: 0 },
    rewards: [{ type: String }],
    registrationDate: { type: Date, default: Date.now },
    password: { type: String, required: true },
    isAdmin: { type: Boolean, default: false },
    lastPayment: { type: Date },
    freeSlots: { type: Number, default: 0 },
    address: { type: String },
    bankName: { type: String },
    accountNumber: { type: String },
    ifscCode: { type: String },
    accountHolderName: { type: String },
    upiNumber: { type: String },
    selectedProducts: [{ type: String}],
    credits: [],
    withdrawals: [],
    aadharFront: { type: String },
    aadharBack: { type: String },
    pancard: { type: String },
    status: { type: String, default: 'inactive' },
    payment_status: {
        level1: { type: Boolean, default: false },
        level2: { type: Boolean, default: false },
        level3: { type: Boolean, default: false },
        level4: { type: Boolean, default: false },
        level5: { type: Boolean, default: false },
        level6: { type: Boolean, default: false },
        level7: { type: Boolean, default: false },
        level8: { type: Boolean, default: false },
        level9: { type: Boolean, default: false },
        company: { type: Boolean, default: false },
    }
});

module.exports = mongoose.model('User', userSchema);