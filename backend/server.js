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

    // 📌 Configuración de MySQL con SSL y límite de conexiones incrementado
    const db = await mysql.createPool({
        host: "db-mysql-app-salud-do-user-18905968-0.j.db.ondigitalocean.com",
        user: "doadmin",
        password: "AVNS_eC3dTdiST4fJ0_6la0r",
        database: "salud_app_db",
        port: 25060,
        ssl: { ca: fs.readFileSync(certPath) },
        waitForConnections: true,
        connectionLimit: 500, // Incrementado a 500
        queueLimit: 0
    });

    console.log("✅ Conectado a MySQL con SSL");

    // 📌 Configuración de DigitalOcean Spaces
    const s3Client = new S3Client({
        endpoint: "https://sfo2.digitaloceanspaces.com",
        region: "sfo2",
        credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY
        }
    });

    // 📌 Configuración de Multer para manejar archivos en memoria
    const storage = multer.memoryStorage();
    const upload = multer({ storage: storage });

    // 📌 Función Genérica para Subir Imágenes a Spaces
    async function subirImagen(buffer, key, mimetype) {
        try {
            const uploadParams = {
                Bucket: "salud-magenes",
                Key: key,
                Body: buffer,
                ACL: "public-read",
                ContentType: mimetype
            };
            const command = new PutObjectCommand(uploadParams);
            await s3Client.send(command);
            return `https://salud-magenes.sfo2.digitaloceanspaces.com/${key}`;
        } catch (error) {
            console.error("❌ Error al subir la imagen a Spaces:", error.message);
            throw new Error("Error al subir la imagen.");
        }
    }

    // 📌 Endpoint para obtener información completa del usuario
    app.get("/usuario/:nss", async (req, res) => {
        try {
            const { nss } = req.params;

            // Obtener datos del usuario
            const [userResult] = await db.execute("SELECT nombre, edad, sexo FROM usuarios WHERE nss = ?", [nss]);
            if (userResult.length === 0) {
                return res.status(404).json({ error: "Usuario no encontrado." });
            }

            // Obtener foto de perfil
            const [imageResult] = await db.execute("SELECT url FROM imagenes WHERE usuario_nss = ? AND tipo = 'perfil'", [nss]);
            const userImage = imageResult.length > 0 ? imageResult[0].url : null;

            // Obtener imágenes de medicamentos
            const [medicamentosResult] = await db.execute("SELECT url, descripcion FROM imagenes WHERE usuario_nss = ? AND tipo = 'medicamento'", [nss]);

            res.json({
                nss,
                nombre: userResult[0].nombre,
                edad: userResult[0].edad,
                sexo: userResult[0].sexo,
                fotoPerfil: userImage,
                medicamentos: medicamentosResult
            });

        } catch (error) {
            console.error("❌ Error al obtener la información del usuario:", error.message);
            res.status(500).json({ error: "Error en el servidor al obtener la información." });
        }
    });

    // 📌 Endpoint para subir foto de perfil
    app.post("/perfil", upload.single("imagen"), async (req, res) => {
        try {
            if (!req.file || !req.file.mimetype.startsWith("image/")) {
                return res.status(400).json({ error: "El archivo debe ser una imagen válida." });
            }

            const { usuario_nss } = req.body;
            if (!usuario_nss) {
                return res.status(400).json({ error: "El usuario_nss es obligatorio." });
            }

            const key = `imagenes/perfil_${usuario_nss}.jpg`;
            const imageUrl = await subirImagen(req.file.buffer, key, req.file.mimetype);

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
            console.error("❌ Error al subir la foto de perfil:", error.message);
            res.status(500).json({ error: "Error en el servidor al subir la imagen." });
        }
    });

    // 📌 Endpoint para subir imágenes de medicamentos
    app.post("/medicamentos", upload.single("imagen"), async (req, res) => {
        try {
            if (!req.file || !req.file.mimetype.startsWith("image/")) {
                return res.status(400).json({ error: "El archivo debe ser una imagen válida." });
            }

            const { usuario_nss, descripcion } = req.body;
            if (!usuario_nss || !descripcion) {
                return res.status(400).json({ error: "Todos los campos son obligatorios." });
            }

            const key = `imagenes/${Date.now()}-${req.file.originalname}`;
            const imageUrl = await subirImagen(req.file.buffer, key, req.file.mimetype);

            await db.execute("INSERT INTO imagenes (usuario_nss, tipo, url, descripcion) VALUES (?, 'medicamento', ?, ?)", [usuario_nss, imageUrl, descripcion]);

            res.status(201).json({
                message: "Imagen de medicamento guardada con éxito.",
                url: imageUrl
            });

        } catch (error) {
            console.error("❌ Error al subir la imagen de medicamento:", error.message);
            res.status(500).json({ error: "Error en el servidor al subir la imagen." });
        }
    });

    app.listen(PORT, () => console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`));
}

iniciarServidor();
