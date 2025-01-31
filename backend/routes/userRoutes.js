const express = require('express');
const { uploadProfilePicture, getUserProfile } = require('../controllers/userController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/user', authenticateToken, getUserProfile);
router.post('/upload', authenticateToken, uploadProfilePicture);

module.exports = router;