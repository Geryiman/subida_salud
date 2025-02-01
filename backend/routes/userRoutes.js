const express = require('express');
const { uploadProfilePicture, getUserProfile } = require('../controllers/userController');
const authenticateToken = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');

const router = express.Router();

router.get('/user', authenticateToken, getUserProfile);
router.post('/upload', authenticateToken, uploadProfilePicture);
router.get('/profile', userController.getUserProfile);

module.exports = router;