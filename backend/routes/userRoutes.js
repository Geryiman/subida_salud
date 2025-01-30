const express = require('express');
const { uploadProfilePicture } = require('../controllers/userController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/upload', authenticateToken, uploadProfilePicture);

module.exports = router;