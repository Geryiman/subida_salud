const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const db = require('../server'); // 📌 Importa `db` desde `server.js`

// Configuración de DigitalOcean Spaces con AWS SDK v3
const s3 = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT,
  region: 'us-east-1', // DigitalOcean Spaces usa 'us-east-1' por defecto, ajusta si es necesario
  credentials: {
    accessKeyId: process.env.SPACES_KEY,
    secretAccessKey: process.env.SPACES_SECRET,
  },
});

// 📌 Subida de foto de perfil
exports.uploadProfilePicture = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se ha subido ningún archivo' });
  }

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
    await s3.send(new PutObjectCommand(params)); // 📌 Enviar la imagen al espacio de DigitalOcean
    const imageUrl = `${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET}/${fileName}`;

    db.query('UPDATE usuarios SET fotoPerfil = ? WHERE nss = ?', [imageUrl, nss], (err) => {
      if (err) {
        console.error('Error actualizando la foto en la base de datos:', err);
        return res.status(500).json({ error: 'Error actualizando foto de perfil' });
      }
      res.json({ message: 'Foto de perfil actualizada', imageUrl });
    });
  } catch (error) {
    console.error('Error subiendo imagen:', error);
    res.status(500).json({ error: 'Error subiendo imagen' });
  }
};

// 📌 Obtener datos del perfil del usuario
exports.getUserProfile = async (req, res) => {
  const { nss } = req.query;

  if (!nss) {
      return res.status(400).json({ error: 'NSS es requerido' });
  }

  try {
      const connection = await db().getConnection(); // 📌 Usar `await db()`
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
      console.error('Error en la consulta del perfil:', err);
      res.status(500).json({ error: 'Error al obtener los datos del perfil' });
  }
};