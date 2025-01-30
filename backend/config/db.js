const mysql = require('mysql2');
const axios = require('axios');
require('dotenv/config');
const fs = require('fs');
const path = require('path');

// Construcción de la URL del certificado desde el bucket de DigitalOcean Spaces
const CERTIFICATE_URL = process.env.SPACES_ORIGIN
  ? `${process.env.SPACES_ORIGIN}/ca-certificate.crt`
  : null;

if (!CERTIFICATE_URL) {
  console.error('Error: La variable de entorno SPACES_ORIGIN no está definida.');
  process.exit(1);
}

// Ruta local para guardar el certificado descargado
const CERTIFICATE_PATH = path.join(__dirname, 'ca-certificate.crt');

// Función para descargar el certificado
async function downloadCertificate() {
  try {
    console.log('Descargando certificado desde DigitalOcean Spaces...');
    const response = await axios.get(CERTIFICATE_URL, { responseType: 'arraybuffer' });
    fs.writeFileSync(CERTIFICATE_PATH, response.data);
    console.log('Certificado descargado y guardado correctamente.');
  } catch (error) {
    console.error('Error al descargar el certificado:', error);
    process.exit(1); // Detiene la ejecución si no se puede descargar el certificado
  }
}

// Función para conectar a la base de datos
async function connectDB() {
  // Descargar el certificado antes de intentar la conexión
  await downloadCertificate();

  // Leer el certificado desde el archivo local
  const certificate = fs.readFileSync(CERTIFICATE_PATH);

  // Configurar la conexión con MySQL
  const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { ca: certificate }, // Configuración SSL con el certificado descargado
  });

  // Probar la conexión
  db.getConnection((err, connection) => {
    if (err) {
      console.error('Error conectando a la base de datos:', err);
    } else {
      console.log('Conectado a MySQL correctamente.');
      connection.release();
    }
  });

  return db;
}

// Exportar la conexión
module.exports = connectDB();
