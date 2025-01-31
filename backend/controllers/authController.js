const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Registro de usuario
exports.registerUser = async (req, res) => {
  const { nombre, nss, edad, sexo, password } = req.body;

  // Validar datos de entrada
  if (!nombre || !nss || !edad || !sexo || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }
  if (!/^\d{11}$/.test(nss)) {
    return res.status(400).json({ error: 'El NSS debe tener exactamente 11 dígitos' });
  }
  if (password.length < 3) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 3 caracteres' });
  }

  try {
    // Verificar si el NSS ya existe
    const [results] = await db.query('SELECT * FROM usuarios WHERE nss = ?', [nss]);
    if (results.length > 0) {
      return res.status(400).json({ error: 'NSS ya registrado' });
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insertar usuario
    await db.query(
      'INSERT INTO usuarios (nombre, nss, edad, sexo, password) VALUES (?, ?, ?, ?, ?)',
      [nombre, nss, edad, sexo, hashedPassword]
    );

    res.status(201).json({ message: 'Usuario registrado exitosamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en el registro' });
  }
};

// Inicio de sesión
exports.loginUser = async (req, res) => {
  const { nss, password } = req.body;

  // Validar datos de entrada
  if (!nss || !password) {
    return res.status(400).json({ error: 'NSS y contraseña son obligatorios' });
  }

  try {
    // Verificar si el usuario existe
    const [results] = await db.query('SELECT * FROM usuarios WHERE nss = ?', [nss]);
    if (results.length === 0) {
      return res.status(400).json({ error: 'Usuario no encontrado' });
    }

    const user = results[0];

    // Verificar la contraseña
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Contraseña incorrecta' });
    }

    // Generar token JWT
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.json({
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        nss: user.nss,
        edad: user.edad,
        sexo: user.sexo,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en el inicio de sesión' });
  }
};
