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
const db = require('../config/db');

exports.getUserProfile = async (req, res) => {
  const { nss } = req.query; // 📌 Obtener el NSS desde la URL

  if (!nss) {
    return res.status(400).json({ error: 'NSS es requerido' });
  }

  try {
    const connection = await db(); // 📌 Obtener la conexión a la base de datos
    const [results] = await connection.query(
      'SELECT nombre, nss, edad, sexo, fotoPerfil FROM usuarios WHERE nss = ?',
      [nss]
    );

    connection.release(); // 📌 Liberar la conexión

    if (results.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(results[0]); // 📌 Enviar los datos del usuario al frontend
  } catch (err) {
    console.error('Error al obtener los datos del perfil:', err);
    res.status(500).json({ error: 'Error al obtener los datos del perfil' });
  }
};
