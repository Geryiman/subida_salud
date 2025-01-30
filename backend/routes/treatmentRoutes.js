const express = require('express');
const { getTreatments, addTreatment } = require('../controllers/treatmentController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', authenticateToken, getTreatments);
router.post('/', authenticateToken, addTreatment);

module.exports = router;
