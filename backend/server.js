const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const fs = require("fs");
const axios = require("axios");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const certPath = "./ca-certificate.crt";

// 📌 Descargar certificado SSL automáticamente
async function descargarCertificado() {
    try {
        const url = "https://salud-magenes.sfo2.digitaloceanspaces.com/ca-certificate.crt";
        const response = await axios.get(url, { responseType: "arraybuffer" });
        fs.writeFileSync(certPath, response.data);
        console.log("✅ Certificado SSL descargado correctamente.");
    } catch (error) {
        console.error("❌ Error descargando el certificado SSL:", error.message);
        process.exit(1);
    }
}

async function iniciarServidor() {
    await descargarCertificado();

    // 📌 Configuración de MySQL con SSL
    const db = await mysql.createPool({
        host: "db-mysql-app-salud-do-user-18905968-0.j.db.ondigitalocean.com",
        user: "doadmin",
        password: "AVNS_eC3dTdiST4fJ0_6la0r",
        database: "salud_app_db",
        port: 25060,
        ssl: { ca: fs.readFileSync(certPath) },
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    console.log("✅ Conectado a MySQL con SSL");

    // 📌 Configuración de DigitalOcean Spaces
    const s3Client = new S3Client({
        endpoint: "https://sfo2.digitaloceanspaces.com",
        region: "sfo2",
        credentials: {
            accessKeyId: "DO801LTEURCEU7UEUYVJ",
            secretAccessKey: "TU_SECRET_ACCESS_KEY"
        }
    });

    // 📌 Configuración de Multer para manejar archivos en memoria
    const storage = multer.memoryStorage();
    const upload = multer({ storage: storage });

    // 📌 Endpoint para subir y actualizar la foto de perfil del usuario
    app.post("/perfil", upload.single("imagen"), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: "No se recibió un archivo." });

            const { usuario_nss } = req.body;
            if (!usuario_nss) return res.status(400).json({ error: "El usuario_nss es obligatorio." });

            // 🔹 Generar un nombre único para la imagen de perfil
            const key = `imagenes/perfil_${usuario_nss}.jpg`;

            const uploadParams = {
                Bucket: "salud-magenes",
                Key: key,
                Body: req.file.buffer,
                ACL: "public-read",
                ContentType: req.file.mimetype
            };

            const command = new PutObjectCommand(uploadParams);
            await s3Client.send(command);

            const imageUrl = `https://salud-magenes.sfo2.digitaloceanspaces.com/${key}`;

            // 🔹 Guardar o actualizar la foto de perfil en MySQL
            const query = `
                INSERT INTO imagenes (usuario_nss, tipo, url, descripcion)
                VALUES (?, 'perfil', ?, 'Foto de perfil')
                ON DUPLICATE KEY UPDATE url = VALUES(url), descripcion = 'Foto de perfil'
            `;
            await db.execute(query, [usuario_nss, imageUrl]);

            res.status(201).json({
                message: "Foto de perfil actualizada con éxito.",
                url: imageUrl
            });

        } catch (error) {
            console.error("❌ Error al subir la foto de perfil:", error);
            res.status(500).json({ error: "Error en el servidor al subir la imagen." });
        }
    });

    // 📌 Endpoint para subir imágenes de medicamentos
    app.post("/medicamentos", upload.single("imagen"), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: "No se recibió un archivo." });

            const { usuario_nss, descripcion } = req.body;
            if (!usuario_nss || !descripcion) {
                return res.status(400).json({ error: "Todos los campos son obligatorios." });
            }

            // 🔹 Generar un nombre único para la imagen
            const key = `imagenes/${Date.now()}-${req.file.originalname}`;

            const uploadParams = {
                Bucket: "salud-magenes",
                Key: key,
                Body: req.file.buffer,
                ACL: "public-read",
                ContentType: req.file.mimetype
            };

            const command = new PutObjectCommand(uploadParams);
            await s3Client.send(command);

            const imageUrl = `https://salud-magenes.sfo2.digitaloceanspaces.com/${key}`;

            // 🔹 Guardar en MySQL
            const query = "INSERT INTO imagenes (usuario_nss, tipo, url, descripcion) VALUES (?, 'medicamento', ?, ?)";
            await db.execute(query, [usuario_nss, imageUrl, descripcion]);

            res.status(201).json({
                message: "Imagen de medicamento guardada con éxito.",
                url: imageUrl
            });

        } catch (error) {
            console.error("❌ Error al subir la imagen:", error);
            res.status(500).json({ error: "Error en el servidor al subir la imagen." });
        }
    });

    // 📌 Endpoint para obtener la foto de perfil del usuario
    app.get("/perfil/:nss", async (req, res) => {
        try {
            const { nss } = req.params;
            const [result] = await db.execute("SELECT url FROM imagenes WHERE usuario_nss = ? AND tipo = 'perfil'", [nss]);

            if (result.length === 0) {
                return res.status(404).json({ error: "No se encontró foto de perfil para este usuario." });
            }

            res.json({ url: result[0].url });

        } catch (error) {
            console.error("❌ Error al obtener la foto de perfil:", error);
            res.status(500).json({ error: "Error en el servidor al obtener la imagen." });
        }
    });

    // 📌 Endpoint para obtener todas las imágenes de medicamentos de un usuario
    app.get("/medicamentos/:nss", async (req, res) => {
        try {
            const { nss } = req.params;
            const [result] = await db.execute("SELECT url FROM imagenes WHERE usuario_nss = ? AND tipo = 'medicamento'", [nss]);

            if (result.length === 0) {
                return res.status(404).json({ error: "No se encontraron imágenes de medicamentos para este usuario." });
            }

            res.json({ imagenes: result.map(row => row.url) });

        } catch (error) {
            console.error("❌ Error al obtener imágenes de medicamentos:", error);
            res.status(500).json({ error: "Error en el servidor al obtener la imagen." });
        }
    });

    app.listen(PORT, () => console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`));
}

iniciarServidor();
