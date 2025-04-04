const User = require('../models/User');
const bcrypt = require('bcrypt');
const Achiever = require('../models/Acheiver');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const DepositRequests = require('../models/DepositRequests');
const { default: mongoose } = require('mongoose');
const PDFDocument = require("pdfkit");
const fs = require("fs");
const Company = require('../models/Company');
const ProductRequests = require('../models/ProductRequests');

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
    const { username, sponsor, password, email, mobile, fullname, products } = req.body;
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
            name: fullname,
            selectedProducts: products,
        });

        sponsorr.downlines?.push(user._id);
        sponsorr.freeSlots -= 1; // Decrease the free slots of the sponsor
        const produtRequest = new ProductRequests({
            userId: user._id,
            productName: products,
            status: 'pending'
        })
        
        await user.save();
        await produtRequest.save()
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
            isAdmin: user.isAdmin,
            address: user.address,
            bankName: user.bankName,
            accountNumber: user.accountNumber,
            ifscCode: user.ifscCode,
            accountHolderName: user.accountHolderName,
        } });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Logout Function

exports.logout = async (req,res) => {
    try {
        res.clearCookie("token")

        return res.status(200).json({message: 'Logout Successfull'})
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

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
            selfEarning: user.selfEarning || 0,
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
    console.log(userId);
    
    try {
        const userTree = await User.aggregate([
            { $match: { _id: new mongoose.Types.ObjectId(userId) } },
            {
                $graphLookup: {
                    from: "users", // Collection name
                    startWith: "$downlines",
                    connectFromField: "downlines",
                    connectToField: "_id",
                    maxDepth: 8, // 9 levels deep (0-based index)
                    as: "tree",
                },
            },
        ]);

        if (!userTree.length) return res.status(404).json({ message: "User not found" });

        // Convert to hierarchical structure
        const rootUser = userTree[0];
        const userMap = new Map();

        // Map users by ID
        [rootUser, ...rootUser.tree].forEach((user) => {
            userMap.set(user._id.toString(), { ...user, children: [] });
        });

        // Assign children to parents
        userMap.forEach((user) => {
            user.downlines.forEach((childId) => {
                if (userMap.has(childId.toString())) {
                    userMap.get(user._id.toString()).children.push(userMap.get(childId.toString()));
                }
            });
        });

        res.status(200).json(userMap.get(rootUser._id.toString()));
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

function generateMLMPdf(userData, outputPath) {
    const doc = new PDFDocument({ size: "A4", margin: 30 });

    // Save PDF to file
    doc.pipe(fs.createWriteStream(outputPath));

    // Header
    doc.fontSize(18).fillColor("black").text("Printable Form", { align: "center" }).moveDown(1.5);

    // Layout Constants
    const startX = doc.page.margins.left;
    let y = doc.y;

    userData.forEach((user, index) => {
        const leftX = startX;
        const rightX = 320;

        // Left Column (basic info)
        doc.fontSize(12).fillColor("black").text(`${user.level}`, leftX, y);
        doc.fontSize(10).text(`Name: ${user.name}`, leftX + 25, y);
        y += 15;
        doc.text(`Mobile: ${user.mobile}`, leftX + 25, y);
        y += 15;
        doc.fillColor("red").text(`ID No: ${user.id}`, leftX + 25, y);
        y += 15;

        // Right Column (bank info)
        doc.fillColor("black").fontSize(10).text(`Bank A/c No.: ${user.bankAccount}`, rightX, y - 30);
        doc.text(`IFSC: ${user.ifsc}`, rightX, y - 15);

        // Gap before next user
        y += 20;

        // Add page break if going too far down
        if (y > doc.page.height - 60) {
            doc.addPage();
            y = doc.y;
        }
    });

    doc.end();
}

// Generate the PDF
// generateMLMPdf(sampleUsers, "mlm_printable_form.pdf");

exports.generatePdfForm = async (req, res) => {
    const { sponsor } = req.params;

    try {
        let uplines = [];

        let currentUser = await User
            .findById(sponsor)
            .populate('sponsor', '_id name email level');

        while (currentUser) {
            uplines.push(currentUser);
            currentUser = await User
                .findById(currentUser.sponsor)
                .populate('sponsor', '_id name email level');
        }

        uplines.reverse();

        const doc = new PDFDocument({ margin: 30 });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=mlm_printable_form.pdf");

        doc.pipe(res);

        // Page and layout constants
        const boxHeight = 60;
        const pageHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
        const maxPerPage = Math.floor(pageHeight / boxHeight); // typically 12
        let y = doc.page.margins.top;

        let level = 1;

        const allEntries = [
            ...uplines.map(user => ({
                level: user.level,
                name: user.name,
                mobile: user.mobile,
                referralCode: user.referralCode,
                bankAccount: user.bankAccount,
                ifsc: user.ifsc
            })),
            ...["A", "B", "C"].map(label => ({
                label: `${label}.`,
                name: "______________________",
                mobile: "______________________",
                referralCode: "______________________",
                bankAccount: "______________________",
                ifsc: "______________________"
            }))
        ];

        for (let i = 0; i < allEntries.length; i++) {
            const entry = allEntries[i];

            if (y + boxHeight > pageHeight + doc.page.margins.top) {
                doc.addPage();
                y = doc.page.margins.top;
            }

            // Draw border box
            doc.rect(30, y, 540, boxHeight).stroke();

            // Content positions
            const leftX = 40;
            const rightX = 310;
            const lineY = y + 8;

            doc.fontSize(10).fillColor("red").text(`${entry.level} Name: ${entry.name}`, leftX, lineY);
            doc.fillColor("black").text(`Mobile: ${entry.mobile}`, leftX, lineY + 14);

            doc.fillColor("red").text(`ID: ${entry.referralCode}`, rightX, lineY);
            doc.fillColor("black").text(`A/c No.: ${entry.bankAccount}`, rightX, lineY + 14);
            doc.text(`IFSC: ${entry.ifsc}`, rightX, lineY + 28);

            // Manually move to next box
            y += boxHeight;
        }

        doc.end();
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.payToCompany = async (req, res) => {
    const {userId} = req.params
    try {
        const [company, user] = await Promise.all([
            Company.findOne({}), // Assuming there's only one company document
            User.findById(userId)
        ]);

        if (!company) return res.status(404).json({ message: 'Company data not found' });
        if (!user) return res.status(404).json({ message: 'User data not found' });

        if(user.walletBalance < 1500) return res.status(400).json({ message: 'Insufficient balance' });

        company.totalEarnings += 1500;
        user.walletBalance -= 1500; // Deduct from user's wallet balance
        user.lastPayment = new Date(); // Update last payment date
        user.freeSlots = 3
        user.selfEarning = (user.selfEarning || 0) + 300
        await company.save();
        await user.save()

        res.status(200).json({ message: 'Payment to company successful', totalEarnings: company.totalEarnings });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

exports.getFreeSlotsCount = async (req, res) => {
    const {userId} = req.params

    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.status(200).json({ freeSlots: user.freeSlots });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

const getDownlineList = async (userId, downlineList = []) => {
    const user = await User.findById(userId)
        .populate({
            path: 'downlines',
            select: 'name username referralCode level mobile email walletBalance downlines sponsor',
            populate: {
                path: 'sponsor',
                select: 'referralCode _id' // Populate sponsor with only referralCode
            }
        });

    if (!user) return [];

    for (const downline of user.downlines) {
        downlineList.push({
            _id: downline._id,
            name: downline.name,
            username: downline.username,
            referralCode: downline.referralCode,
            level: downline.level,
            mobile: downline.mobile,
            email: downline.email,
            walletBalance: downline.walletBalance,
            sponsor: downline.sponsor ? {
                referralCode: downline.sponsor.referralCode,
                _id: downline.sponsor._id
            } : null // Store only referralCode of sponsor
        });

        await getDownlineList(downline._id, downlineList); // Recursively fetch downlines
    }

    return downlineList;
};


const searchInDownlineList = (downlineList, query) => {
    return downlineList
        .filter(user =>
            user?.fullname?.includes(query) ||
            user?.mobile?.includes(query) ||
            user?.referralCode?.includes(query) ||
            user?.username?.includes(query)
        )
        .slice(0, 10); // Return only the top 5 results
};


exports.searchDownline = async (req, res) => {
    try {
        const { userId, query } = req.body;

        const user = await User.findById(userId);
        console.log(userId);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const downlineTree = await getDownlineList(user._id);
        
        const filteredDownline = searchInDownlineList(downlineTree, query);
        
        if(filteredDownline.length === 0) {
            return res.status(404).json({message: 'Faild to search downline.'})
        }

        res.status(200).json({ downlines: filteredDownline });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


exports.getUser = async (req,res) => {
    const { referralCode } = req.params;
    
    try {
        const user = await User.findById(referralCode).populate('downlines', 'name referralCode mobile earnings selfEarnings username');
        if (!user) return res.status(404).json({ message: 'User not found' });

        const downlineTree = await getDownlineList(user._id);


        res.status(200).json({
            username: user.username,
            level: user.level,
            earnings: user.earnings,
            selfEarning: user.selfEarning || 0,
            walletBalance: user.walletBalance,
            downlines: user.downlines,
            referralCode: user.referralCode,
            isAchiever: user.isAchiever || false,
            rewards: user.rewards,
            totalTeam: downlineTree.length,
            name: user.name,
            email: user.email,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

exports.getDownlineLength = async (req, res) => {
    try {
        const downlineList = await getDownlineList(req.body.userId);
        const downlineCount = downlineList.length;

        res.status(200).json({ downlineCount });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

exports.updateProfile = async (req, res) => {
    const { name, username, email, mobile, address, bankName, accountNumber, ifscCode, upiNumber } = req.body;
    
    try {        
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Update user details
        user.name = name || user.name || user.username;
        user.username = username || user.username;
        user.email = email || user.email;
        user.mobile = mobile || user.mobile;
        user.address = address || user.address || 'Not Provided';
        user.bankName = bankName || user.bankName || 'Not Provided';
        user.accountHolderName = name || user.accountHolderName || 'Not Provided';
        user.accountNumber = accountNumber || user.accountNumber || 'Not Provided';
        user.ifscCode = ifscCode || user.ifscCode || 'Not Provided';
        user.upiNumber = upiNumber || user.upiNumber || 'Not Provided';
        
        await user.save();

        user.password = undefined
        user.__v = undefined

        res.json({ message: 'Profile updated successfully', user });

    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.message });
    }
};

exports.changePassword = async (req, res) => {
    const { newPassword } = req.body;

    try { 
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // const isMatch = await bcrypt.compare(oldPassword, user.password);
        // if (!isMatch) return res.status(400).json({ message: 'Old password is incorrect' });

        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'New password must be at least 6 characters' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;

        await user.save();
        res.json({ message: 'Password updated successfully' });

    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.message });
    }
};