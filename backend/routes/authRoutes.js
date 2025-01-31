const express = require('express');
const { body, validationResult } = require('express-validator');
const { registerUser, loginUser } = require('../controllers/authController');

const router = express.Router();

// Middleware para manejar errores de validación
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// Rutas
router.post('/register', [
    body('nombre').notEmpty().withMessage('El nombre es obligatorio'),
    body('nss').isLength({ min: 11, max: 11 }).withMessage('El NSS debe tener 11 dígitos'),
    body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
    handleValidationErrors
], registerUser);

router.post('/login', [
    body('nss').notEmpty().withMessage('El NSS es obligatorio'),
    body('password').notEmpty().withMessage('La contraseña es obligatoria'),
    handleValidationErrors
], loginUser);

module.exports = router;
