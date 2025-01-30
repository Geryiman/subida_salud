const mysql = require('mysql2');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
require("dotenv").config();

const SPACE_NAME = "salud-magenes";
const CERTIFICATE_FILE = "ca-certificate.crt";
const CERTIFICATE_PATH = path.join(__dirname, "certs", CERTIFICATE_FILE);
const REGION = "sfo2"; // Cambia según la región de tu Space

// Configurar AWS SDK para acceder a DigitalOcean Spaces
const s3 = new AWS.S3({
    endpoint: `https://salud-magenes.sfo2.digitaloceanspaces.com`,
    accessKeyId: "DO801LTEURCEU7UEUYVJ",  // Usa variables de entorno para seguridad
    secretAccessKey: "salud-app-spaces-123",
    region: REGION
});

// Función para descargar el certificado desde DigitalOcean Spaces
async function downloadCertificate() {
    if (!fs.existsSync(CERTIFICATE_PATH)) {
        console.log("Descargando el certificado desde Spaces...");

        try {
            const params = { Bucket: SPACE_NAME, Key: CERTIFICATE_FILE };
            const data = await s3.getObject(params).promise();

            fs.mkdirSync(path.dirname(CERTIFICATE_PATH), { recursive: true });
            fs.writeFileSync(CERTIFICATE_PATH, data.Body);

            console.log("✅ Certificado descargado exitosamente.");
        } catch (error) {
            console.error("❌ Error descargando el certificado:", error);
            process.exit(1);
        }
    } else {
        console.log("✅ El certificado ya existe, omitiendo la descarga.");
    }
}

// Función para conectar a MySQL con SSL
async function connectDatabase() {
    try {
        await downloadCertificate();
        const file = fs.readFileSync(CERTIFICATE_PATH);

        const db = mysql.createPool({
            host: "db-mysql-app-salud-do-user-18905968-0.j.db.ondigitalocean.com",
            user: "doadmin",
            password: "AVNS_eC3dTdiST4fJ0_6la0r",
            database: "salud_app",
            port: 25060,
            ssl: { ca: file },
            connectionLimit: 10
        });

        db.getConnection((err, connection) => {
            if (err) {
                console.error("❌ Error conectando a la base de datos:", err);
            } else {
                console.log("✅ Conectado a MySQL en DigitalOcean.");
                connection.release();
            }
        });

        module.exports = db;
    } catch (error) {
        console.error("Error en la configuración de la base de datos:", error);
    }
}

// Iniciar la conexión
connectDatabase();
