const express = require('express');
const router = express.Router();
const {registerUser,login, withdraw, getUserTree, getDashboard, getUpline, postDepositRequest} = require('../controllers/UserController');

router.post('/register', registerUser);
router.post('/login', login);
router.post('/withdraw', withdraw);
router.get('/tree/:userId', getUserTree);
router.get('/dashboard/:username', getDashboard);
router.get('/uplines/:sponsor', getUpline);
router.post('/deposit', postDepositRequest);


module.exports = router;