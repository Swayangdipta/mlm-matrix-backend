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
        sponsorr.freeSlots -= 1; // Decrease the free slots of the sponsor

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
    const doc = new PDFDocument({ size: "A4", margin: 10 });

    // Save PDF to file
    doc.pipe(fs.createWriteStream(outputPath));

    // Define fonts & styles
    doc.fontSize(18).fillColor("black").text("Printable Form", { align: "center" }).moveDown(2);

    userData.forEach((user, index) => {
        doc.fontSize(20).fillColor("red").text(`${user.level}`, { continued: true });
        doc.fontSize(12).fillColor("black").text(`  Name: ${user.name}`);
        doc.text(`  Address: ${user.address}`);
        
        doc.fontSize(10).fillColor("red").text(`  ID No: ${user.id}`);
        doc.text(`  Mobile: ${user.mobile}`);
        doc.text(`  Bank A/c No.: ${user.bankAccount}`);
        doc.text(`  IFSC: ${user.ifsc}`);

        doc.moveDown();
    });

    // Finalize and close the document
    doc.end();
}

// Generate the PDF
// generateMLMPdf(sampleUsers, "mlm_printable_form.pdf");


exports.generatePdfForm = async (req, res) => {
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

        uplines.reverse()

        const doc = new PDFDocument({ margin: 50 });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=mlm_printable_form.pdf");

        // Generate PDF for the user data
        doc.pipe(res);

        // Function to draw a bordered box with padding
        const drawEntryBox = (y) => {
            doc.rect(40, y, 520, 100).stroke(); // Increased height for padding
        };

        let level = 0

        const pageHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
        const boxHeight = 100; // Height of each entry box

        uplines.forEach((user, index) => {
            if (doc.y + boxHeight > pageHeight) {
                doc.addPage(); // Add new page if the next entry would exceed the page height
            }

            const y = doc.y;
            drawEntryBox(y);

            const paddingX = 50;
            const paddingY = y + 10;

            doc.fontSize(18 - (index/2)).fillColor("red").text(`${user.level}. Name: ${user.name || "N/A"}`, paddingX, paddingY);
            doc.text(`Address: ${user.address || "N/A"}`, paddingX, paddingY + 20);

            doc.fontSize(15 - (index/2)).fillColor("red").text(`ID No: ${user.referralCode || "N/A"}`, 360, paddingY);
            doc.text(`Mobile: ${user.mobile || "N/A"}`, 360, paddingY + 20);
            doc.text(`Bank A/c No.: ${user.bankAccount || "N/A"}`, 360, paddingY + 40);
            doc.text(`IFSC: ${user.ifsc || "N/A"}`, 360, paddingY + 60);

            doc.moveDown(2);
        });

        // Empty slots for new joinings (A, B, C)
        ["A", "B", "C"].forEach((label) => {
            if (doc.y + boxHeight > pageHeight) {
                doc.addPage();
            }

            const y = doc.y;
            drawEntryBox(y);

            const paddingX = 50;
            const paddingY = y + 10;

            doc.fontSize(12).fillColor("red").text(`${label}. Name: ______________________`, paddingX, paddingY);
            doc.text(`Address: ______________________`, paddingX, paddingY + 20);

            doc.fillColor("red").text("ID No: ______________________", 360, paddingY);
            doc.text("Mobile: ______________________", 360, paddingY + 20);
            doc.text("Bank A/c No.: _______________", 360, paddingY + 40);
            doc.text("IFSC: ______________________", 360, paddingY + 60);

            doc.moveDown(2);
        });

        doc.end()
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

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

const getDownlineTree = async (userId) => {
    const user = await User.findById(userId).populate('downlines', 'name username referralCode level mobile email walletBalance downlines');
    if (!user) return null;

    const downlineTree = await Promise.all(user.downlines.map(async (downline) => {
        const subtree = await getDownlineTree(downline._id);
        return { ...downline._doc, downlines: subtree };
    }));

    return downlineTree;
};

const searchInDownlineTree = (downlineTree, query) => {
    return downlineTree.filter(user =>
        user.name.includes(query) ||
        user.mobile.includes(query) ||
        user.referralCode.includes(query) ||
        (user.downlines && searchInDownlineTree(user.downlines, query).length > 0)
    ).map(user => ({
        ...user,
        downlines: searchInDownlineTree(user.downlines || [], query)
    }));
};

exports.searchDownline = async (req, res) => {
    try {
        const { userId, query } = req.body;

        const user = await User.findById(userId);
        console.log(userId);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        console.log(1);
        

        const downlineTree = await getDownlineTree(user._id);
        console.log(downlineTree);
        
        const filteredDownline = searchInDownlineTree(downlineTree, query);
        console.log(2);
        console.log(filteredDownline);
        
        if(filteredDownline.length === 0) {
            return res.status(404).json({message: 'Faild to search downline.'})
        }

        res.status(200).json({ downlines: filteredDownline });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
