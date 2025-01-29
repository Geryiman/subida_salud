const express = require('express');
const { getTreatments } = require('../controllers/treatmentController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', authenticateToken, getTreatments);

module.exports = router;
