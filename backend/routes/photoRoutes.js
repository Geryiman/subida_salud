
const express = require('express');
const { savePhoto, getPhotos, savePushToken } = require('../controllers/photoController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', authenticateToken, savePhoto);
router.get('/', authenticateToken, getPhotos);
router.post('/save-push-token', authenticateToken, savePushToken);

module.exports = router;