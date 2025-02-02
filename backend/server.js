require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Rutas
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const treatmentRoutes = require('./routes/treatmentRoutes');

const app = express();

// Middlewares
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // Permitir solicitudes desde cualquier origen
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
      return res.sendStatus(200); // Responde a las solicitudes preflight (CORS)
  }

  next();
});

app.use(cors({
    origin: '*', // Permitir solicitudes desde cualquier origen
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
app.use(express.json());

// Ruta principal
app.get("/", (req, res) => {
    res.send("Funciona la API 12x1");
});

// Rutas específicas
app.use('/auth', authRoutes); 
app.use('/users', userRoutes);
app.use('/treatments', treatmentRoutes);

// 📌 Corrección de interpolación de strings
const CERTIFICATE_URL = process.env.SPACES_ORIGIN
  ? `${process.env.SPACES_ORIGIN}/ca-certificate.crt`
  : null;

if (!CERTIFICATE_URL) {
  console.error('❌ Error: La variable de entorno SPACES_ORIGIN no está definida.');
  process.exit(1);
}

// Ruta local del certificado
const CERTIFICATE_PATH = path.join(__dirname, 'ca-certificate.crt');

// 📌 Función para descargar el certificado
async function downloadCertificate() {
  try {
    console.log('📥 Descargando certificado desde DigitalOcean Spaces...');
    const response = await axios.get(CERTIFICATE_URL, { responseType: 'arraybuffer' });
    console.log('📥 Respuesta de la descarga:', response.status, response.statusText);
    fs.writeFileSync(CERTIFICATE_PATH, response.data);
    console.log('✅ Certificado descargado y guardado correctamente en:', CERTIFICATE_PATH);
  } catch (error) {
    console.error('❌ Error al descargar el certificado:', error.message);
    process.exit(1);
  }
}

// 📌 Función para conectar a MySQL
async function connectDB() {
  await downloadCertificate(); // Asegurar la descarga antes de conectar

  // Leer el certificado descargado
  const certificate = fs.readFileSync(CERTIFICATE_PATH);
  console.log('✅ Certificado leído correctamente.');

  // Configurar la conexión MySQL
  const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { ca: certificate }, // Conectar con SSL
  });

  console.log('🔄 Intentando conectar a MySQL...');

  // 📌 Probar la conexión
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

// Iniciar el servidor en el puerto definido o por defecto en 5000
const PORT = process.env.PORT || 5000;

// Conectar a la base de datos y luego iniciar el servidor
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Error al conectar a la base de datos:', err);
});