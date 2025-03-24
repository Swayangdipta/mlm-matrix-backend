const User = require('../models/User');
const bcrypt = require('bcrypt');
const Achiever = require('../models/Acheiver');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const DepositRequests = require('../models/DepositRequests');

// Helper function to distribute earnings to uplines
const distributeEarnings = async (userId) => {
    let currentUser = await User.findById(userId);
    let earningsDistributed = 0;

    for (let i = 1; i <= 8; i++) {  // Upline distribution for 8 levels
        if (!currentUser || !currentUser.sponsor) break;

        const sponsor = await User.findById(currentUser.sponsor);
        if (sponsor) {
            sponsor.earnings += 100;
            sponsor.walletBalance += 100;
            await sponsor.save();
            earningsDistributed += 100;
        }
        currentUser = sponsor;
    }
    return earningsDistributed;
};

// Level-Based Rewards
const getRewardsForLevel = (level) => {
    switch (level) {
        case 3: return ['Blanket'];
        case 5: return ['32" LED'];
        case 7: return ['Bike'];
        case 9: return ['Alto Car'];
        default: return [];
    }
};

// Promote user to the next level if their downlines are filled
const promoteUser = async (user) => {
    if (user.downlines.length === 3) {
        const downlineUsers = await User.find({ _id: { $in: user.downlines } });

        // Check if all downline members have reached the required level
        const allDownlinesEligible = downlineUsers.every(downline => downline.downlines.length === 3);

        if (allDownlinesEligible) {
            let currentUser = user;

            while (currentUser) {
                if (currentUser.level > 9) { // Check if the user has crossed level 9
                    // Move top user to Achiever collection and delete from User collection
                    const achiever = new Achiever({
                        username: currentUser.username,
                        level: currentUser.level,
                        rewards: currentUser.rewards,
                        earnings: currentUser.earnings,
                        registrationDate: currentUser.registrationDate
                    });
                    await achiever.save();
                    await User.findByIdAndDelete(currentUser._id);
                    break; // Stop the promotion process
                }

                currentUser.level++;
                const rewards = getRewardsForLevel(currentUser.level);
                if (rewards.length > 0) {
                    currentUser.rewards.push(...rewards);
                }
                await currentUser.save();

                if (!currentUser.sponsor) break;

                currentUser = await User.findById(currentUser.sponsor);
            }
        }
    }
};

// User Registration
exports.registerUser = async (req, res) => {
    const { username, sponsor, password, email, mobile, fullname } = req.body;
    try {        
        const hashedPassword = await bcrypt.hash(password, 10);
        const referralCode = uuidv4().slice(0, 8);

        const sponsorr = await User.findOne({ referralCode: sponsor });
        if (!sponsorr) return res.status(404).json({ message: 'Sponsor not found' });

        if(sponsorr.downlines?.length >= 3) return res.status(400).json({ message: 'Sponsor has reached maximum downlines' });

        const user = new User({ 
            username,
            password: hashedPassword, 
            referralCode,
            sponsor: sponsorr._id,
            walletBalance: 0,
            level: 1,
            earnings: 0,
            rewards: [],
            email,
            mobile,
            name: fullname
        });

        sponsorr.downlines?.push(user._id);

        await user.save();
        await sponsorr.save();

        await distributeEarnings(user._id);
        await promoteUser(sponsorr);

        res.status(201).json({ message: 'User registered successfully', referralCode });
    } catch (error) {
        console.log(error);
        
        res.status(500).json({ message: error.message });
    }
};

// User Login
exports.login = async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username }).populate('downlines', '_id name email');
        if (!user) return res.status(404).json({ message: 'User not found' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid password' });

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.cookie('token', token);

        res.status(200).json({ message: 'Login successful', token, user: {
            _id: user._id,
            name: user.name,
            username: user.username,
            email: user.email,
            mobile: user.mobile,
            level: user.level,
            earnings: user.earnings,
            walletBalance: user.walletBalance,
            downlines: user.downlines,
            referralCode: user.referralCode,
            rewards: user.rewards,
            sponsor: user.sponsor,
            isAdmin: user.isAdmin
        } });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Withdrawal Route
exports.withdraw = async (req, res) => {
    const { username, amount } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user.walletBalance < amount) return res.status(400).json({ message: 'Insufficient balance' });

        user.walletBalance -= amount;
        await user.save();

        res.status(200).json({ message: 'Withdrawal successful', remainingBalance: user.walletBalance });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Dashboard API
exports.getDashboard = async (req, res) => {
    const { username } = req.params;

    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.status(200).json({
            username: user.username,
            level: user.level,
            earnings: user.earnings,
            walletBalance: user.walletBalance,
            downlines: user.downlines.length,
            referralCode: user.referralCode,
            isAchiever: user.isAchiever || false,
            rewards: user.rewards
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get User Tree
exports.getUserTree = async (req, res) => {
    const { userId } = req.params;

    try {
        const user = await User.findById(userId).populate({
            path: 'downlines',
            populate: {
                path: 'downlines',
                populate: {
                    path: 'downlines',
                    populate: {
                        path: 'downlines'
                    }
                }
            }
        });

        if (!user) return res.status(404).json({ message: 'User not found' });

        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getUpline = async (req, res) => {
    const { sponsor } = req.params;

    try {
        let uplines = []

        let currentUser = await User
            .findById(sponsor)
            .populate('sponsor', '_id name email');

        while (currentUser) {
            uplines.push(currentUser);
            currentUser = await User
                .findById(currentUser.sponsor)
                .populate('sponsor', '_id name email');
        }

        res.status(200).json(uplines);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}

exports.postDepositRequest = async (req, res) => {

    const { amount, user } = req.body;
    try {
        console.log(req.body);
        
        const temp = await User.findById(user)

        if (!temp) return res.status(404).json({ message: 'User not found' });

        const depositRequest = new DepositRequests({
            user: temp._id,
            amount,
            status: 'pending'
        });

        await depositRequest.save();
        res.status(200).json({ message: 'Deposit request submitted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }

}