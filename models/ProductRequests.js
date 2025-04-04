const mongoose = require('mongoose');

const productRequestSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    productName:[{ type: String, required: true }],
    requestDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'processed', 'delivered'], default: 'pending' }
},{timestamps: true});

module.exports = mongoose.model('ProductRequest', productRequestSchema);