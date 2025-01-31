const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');


exports.registerUser = async (req, res) => {
  const { nombre, nss, edad, sexo, password } = req.body;

  (await db()).query('SELECT * FROM usuarios WHERE nss = ?', [nss], async (err, results) => {
    if (results.length > 0) {
      return res.status(400).json({ error: 'NSS ya registrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    (await db()).query(
      'INSERT INTO usuarios (nombre, nss, edad, sexo, password) VALUES (?, ?, ?, ?, ?)',
      [nombre, nss, edad, sexo, hashedPassword],
      (err) => {
        if (err) return res.status(500).json({ error: 'Error en el registro' });
        res.status(201).json({ message: 'Usuario registrado exitosamente' });
      }
    );
  });
};

exports.loginUser = async (req, res) => {
  const { nss, password } = req.body;

  (await db()).query('SELECT * FROM usuarios WHERE nss = ?', [nss], async (err, results) => {
    if (results.length === 0) return res.status(400).json({ error: 'Usuario no encontrado' });

    const user = results[0];
    console.log(password );
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) return res.status(400).json({ error: 'Contraseña incorrecta' });

    const token = jwt.sign({ nss: user.nss }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: { nombre: user.nombre, nss: user.nss, edad: user.edad, sexo: user.sexo } });
    console.log(res, 'Usuari');
  });
};