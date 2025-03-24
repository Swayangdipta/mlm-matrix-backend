const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
    totalEarnings: { type: Number, default: 0 }
});

module.exports = mongoose.model('Company', companySchema);