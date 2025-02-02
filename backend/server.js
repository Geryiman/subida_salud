require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const treatmentRoutes = require('./routes/treatmentRoutes');

const app = express();

// 📌 Middleware para configurar CORS dinámicamente
app.use((req, res, next) => {
  const origin = req.headers.origin; // 📌 Captura el origen de la petición

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin); // ✅ Permite el origen dinámicamente
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true"); // ✅ Permite credenciales

  if (req.method === "OPTIONS") {
    return res.sendStatus(200); // 📌 Responder a preflight request sin problemas
  }

  next();
});

app.use(express.json());

// 📌 Ruta principal
app.get("/", (req, res) => {
    res.send("Funciona la API 12x1");
});

// 📌 Rutas específicas
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/treatments', treatmentRoutes);

// 📌 URL del certificado
const CERTIFICATE_URL = process.env.SPACES_ORIGIN
  ? `${process.env.SPACES_ORIGIN}/ca-certificate.crt`
  : null;

if (!CERTIFICATE_URL) {
  console.error('❌ Error: La variable de entorno SPACES_ORIGIN no está definida.');
  process.exit(1);
}

// 📌 Ruta del certificado
const CERTIFICATE_PATH = path.join(__dirname, 'ca-certificate.crt');

// 📌 Función para descargar el certificado SSL
async function downloadCertificate() {
  try {
    console.log('📥 Descargando certificado desde DigitalOcean Spaces...');
    const response = await axios.get(CERTIFICATE_URL, { responseType: 'arraybuffer' });
    fs.writeFileSync(CERTIFICATE_PATH, response.data);
    console.log('✅ Certificado descargado y guardado correctamente en:', CERTIFICATE_PATH);
  } catch (error) {
    console.error('❌ Error al descargar el certificado:', error.message);
    process.exit(1);
  }
}

// 📌 Variable Global para la Base de Datos
let db;

// 📌 Función para conectar a MySQL
async function connectDB() {
  await downloadCertificate(); // Descargar certificado antes de conectar

  // 📌 Leer el certificado descargado
  const certificate = fs.readFileSync(CERTIFICATE_PATH);
  console.log('✅ Certificado leído correctamente.');

  // 📌 Configurar la conexión MySQL
  db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { ca: certificate },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  console.log('🔄 Intentando conectar a MySQL...');

  // 📌 Probar la conexión a la base de datos
  db.getConnection((err, connection) => {
    if (err) {
      console.error('❌ Error conectando a la base de datos:', err);
    } else {
      console.log('✅ Conectado a MySQL correctamente.');
      connection.release();
    }
  });

  return db;
}

// 📌 Conectar a la base de datos antes de iniciar el servidor
connectDB().then((database) => {
  db = database; // 📌 Asignar la conexión globalmente
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('❌ Error al conectar a la base de datos:', err);
});

// 📌 Exportar la función para obtener `db`
module.exports = async function getDB() {
  if (!db) {
    db = await connectDB();
  }
  return db;
};
