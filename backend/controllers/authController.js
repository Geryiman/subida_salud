const db = require('../server');
const bcrypt = require('bcryptjs');

exports.registerUser = async (req, res) => {
  const { nombre, nss, edad, sexo, password } = req.body;

  try {
    const connection = await db();
    connection.query('SELECT * FROM usuarios WHERE nss = ?', [nss], async (err, results) => {
      if (err) return res.status(500).json({ error: 'Error en la base de datos' });

      if (results.length > 0) {
        return res.status(400).json({ error: 'NSS ya registrado' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      connection.query(
        'INSERT INTO usuarios (nombre, nss, edad, sexo, password) VALUES (?, ?, ?, ?, ?)',
        [nombre, nss, edad, sexo, hashedPassword],
        (err) => {
          if (err) return res.status(500).json({ error: 'Error en el registro' });
          res.status(201).json({ message: 'Usuario registrado exitosamente' });
        }
      );
    });
  } catch (error) {
    console.error('Error en el registro:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.loginUser = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  const { nss, password } = req.body;

  try {
    const connection = await db();
    connection.query('SELECT * FROM usuarios WHERE nss = ?', [nss], async (err, results) => {
      if (err) return res.status(500).json({ error: 'Error en la base de datos' });

      if (results.length === 0) {
        return res.status(400).json({ error: 'Usuario no encontrado' });
      }

      const user = results[0];

      console.log('Contraseña ingresada:', password);
      console.log('Contraseña en BD (hash):', user.password);

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: 'Contraseña incorrecta' });
      }

      // 📌 Solo devolver el NSS en la respuesta
      res.json({ message: 'Inicio de sesión exitoso', nss: user.nss });
    });
  } catch (error) {
    console.error('Error en el login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
