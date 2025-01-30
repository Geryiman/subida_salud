const express = require('express');
const { getTreatments, addTreatment, deleteTreatment } = require('../controllers/treatmentController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', authenticateToken, getTreatments);
router.post('/', authenticateToken, addTreatment);
router.delete('/:id', authenticateToken, deleteTreatment);

module.exports = router;