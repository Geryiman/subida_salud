const express = require('express');
const { getUserProfile, uploadProfilePicture } = require('../controllers/userController');
const authenticateToken = require('../middleware/authMiddleware');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

router.get('/profile', authenticateToken, getUserProfile);
router.post('/upload-profile-pic', authenticateToken, upload.single('photo'), uploadProfilePicture);

module.exports = router;
