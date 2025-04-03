const express = require('express');
const router = express.Router();
const {registerUser,login, withdraw, getUserTree, getDashboard, getUpline, postDepositRequest, generatePdfForm, payToCompany, getFreeSlotsCount, searchDownline} = require('../controllers/UserController');

router.post('/register', registerUser);
router.post('/login', login);
router.post('/withdraw', withdraw);
router.get('/tree/:userId', getUserTree);
router.get('/dashboard/:username', getDashboard);
router.get('/uplines/:sponsor', getUpline);
router.post('/deposit', postDepositRequest);
router.get('/gen-pdf/:sponsor', generatePdfForm);
router.post('/pay-comapny/:userId', payToCompany)
router.get('/free-slots/:userId', getFreeSlotsCount)
router.post('/search', searchDownline)


module.exports = router;