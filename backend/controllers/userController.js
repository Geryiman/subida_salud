const AWS = require('aws-sdk');
const db = require('../config/db');

const s3 = new AWS.S3({
  endpoint: process.env.SPACES_ENDPOINT,
  accessKeyId: process.env.SPACES_KEY,
  secretAccessKey: process.env.SPACES_SECRET,
  });


exports.uploadProfilePicture = async (req, res) => {
  const { nss } = req.user;
  const fileName = `profile_pics/${nss}_${Date.now()}.jpg`;

  const params = {
    Bucket: process.env.SPACES_BUCKET,
    Key: fileName,
    Body: req.file.buffer,
    ACL: 'public-read',
    ContentType: req.file.mimetype,
  };

  try {
    const { Location } = await s3.upload(params).promise();
    db.query('UPDATE usuarios SET fotoPerfil = ? WHERE nss = ?', [Location, nss], (err) => {
      if (err) return res.status(500).json({ error: 'Error actualizando foto de perfil' });
      res.json({ message: 'Foto de perfil actualizada', imageUrl: Location });
    });
  } catch (error) {
    res.status(500).json({ error: 'Error subiendo imagen' });
  }
};

exports.registerUser = async (req, res) => {
  const { nombre, nss, edad, sexo, password } = req.body;

  try {
    const connection = await db(); // Obtener conexión
    const [results] = await connection.query('SELECT * FROM usuarios WHERE nss = ?', [nss]);

    if (results.length > 0) {
      return res.status(400).json({ error: 'NSS ya registrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await connection.query(
      'INSERT INTO usuarios (nombre, nss, edad, sexo, password) VALUES (?, ?, ?, ?, ?)',
      [nombre, nss, edad, sexo, hashedPassword]
    );

    res.status(201).json({ message: 'Usuario registrado exitosamente' });
    connection.release(); // Liberar conexión
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en el registro' });
  }
};