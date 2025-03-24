const express = require('express');
const router = express.Router();
const {getCompanyEarnings , getAllAchievers, getAllDepositRequests, approveAndCreditDeposit} = require('../controllers/AdminController');

router.get('/company-earnings', getCompanyEarnings);
router.get('/achievers', getAllAchievers);
router.get('/deposits', getAllDepositRequests);
router.put('/deposits/:depositId', approveAndCreditDeposit);

module.exports = router;
