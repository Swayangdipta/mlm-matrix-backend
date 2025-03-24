// controllers/AdminController.js
const Company = require('../models/Company');
const Achiever = require('../models/Acheiver.js');
const DepositRequests = require('../models/DepositRequests.js');
const User = require('../models/User.js');

// Get Company Earnings
exports.getCompanyEarnings = async (req, res) => {
    try {
        const company = await Company.findOne();
        if (!company) return res.status(404).json({ message: 'Company data not found' });

        res.status(200).json({ totalEarnings: company.totalEarnings });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get All Achievers
exports.getAllAchievers = async (req, res) => {
    try {
        const achievers = await Achiever.find();
        res.status(200).json(achievers);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


exports.getAllDepositRequests = async (req, res) => {
    try {
        const depositRequests = await DepositRequests.find().populate('user','_id name username email');
        res.status(200).json(depositRequests);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// Get all users
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find();
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

exports.approveAndCreditDeposit = async (req, res) => {
    const { depositId } = req.params;

    try {
        const depositRequest = await DepositRequests.findById(depositId);
        if (!depositRequest) return res.status(404).json({ message: 'Deposit request not found' });

        if (depositRequest.status === 'approved') return res.status(400).json({ message: 'Deposit request already approved' });

        // Update deposit request status
        depositRequest.status = 'approved';
        await depositRequest.save();

        // Credit user wallet
        const user = await User.findById(depositRequest.user);
        user.walletBalance += depositRequest.amount;
        await user.save();

        res.status(200).json({ message: 'Deposit request approved and user wallet credited' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}