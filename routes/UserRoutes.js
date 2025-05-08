const express = require('express');
const router = express.Router();
const {registerUser,login, withdraw, getUserTree, getDashboard, getUpline, postDepositRequest, generatePdfForm, payToCompany, getFreeSlotsCount, searchDownline, getUser, getDownlineLength, updateProfile, changePassword, getWholeDownline, getDirectDownline} = require('../controllers/UserController');
const upload = require('../middlewares/upload');

router.post('/register', registerUser);
router.post('/login', login);
router.post('/withdraw', withdraw);
router.get('/tree/:userId', getUserTree);
router.get('/dashboard/:username', getDashboard);
router.get('/get-user/:referralCode', getUser);
router.get('/downlines/:userId', getWholeDownline);
router.get('/downline/direct/:userId', getDirectDownline);
router.get('/uplines/:sponsor', getUpline);
router.post('/deposit', postDepositRequest);
router.get('/gen-pdf/:sponsor', generatePdfForm);
router.post('/pay-comapny/:userId', payToCompany)
router.get('/free-slots/:userId', getFreeSlotsCount)
router.post('/search', searchDownline)
router.post('/downline-count', getDownlineLength)
router.put('/update-profile/:userId',
    upload.fields([
        { name: 'aadharFront', maxCount: 1 },
        { name: 'aadharBack', maxCount: 1 },
        { name: 'pancard', maxCount: 1 }
      ]),
    updateProfile);
router.put('/change-password/:userId', changePassword);

module.exports = router;