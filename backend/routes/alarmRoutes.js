const express = require('express');
const { createAlarm, getAlarms } = require('../controllers/alarmController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', authenticateToken, createAlarm);
router.get('/', authenticateToken, getAlarms);

module.exports = router;