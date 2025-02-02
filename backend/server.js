const express = require("express");
const mysql = require("mysql2/promise"); // Importamos la versión basada en promesas
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
        endpoint: "https://sfo2.digitaloceanspaces.com", // Endpoint correcto
        region: "sfo2",
        credentials: {
            accessKeyId: "DO00F92NFGUU9UR29VYV", // 🔥 Credenciales directamente en el código
            secretAccessKey: "pr0SzcMGY9zK/TaqelriS6oZJU+D/3K5CHsM7qDyYZU"
        }
    });

    // 📌 Configuración de Multer para manejar archivos
    const storage = multer.memoryStorage();
    const upload = multer({ storage: storage });

    // 📌 Endpoint para subir imágenes a DigitalOcean Spaces
    app.post("/imagenes", upload.single("imagen"), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: "No se recibió un archivo." });

            const { usuario_nss, tipo, descripcion } = req.body;
            if (!usuario_nss) return res.status(400).json({ error: "El usuario_nss es obligatorio." });

            // Generar un nombre único para la imagen
            const key = `imagenes/${Date.now()}-${req.file.originalname}`;

            const uploadParams = {
                Bucket: "salud-magenes", // 🔥 Nombre del bucket en DigitalOcean Spaces
                Key: key,
                Body: req.file.buffer,
                ACL: "public-read",
                ContentType: req.file.mimetype
            };

            const command = new PutObjectCommand(uploadParams);
            await s3Client.send(command);

            const imageUrl = `https://salud-magenes.sfo2.digitaloceanspaces.com/${key}`;

            res.status(201).json({
                message: "Imagen subida con éxito.",
                url: imageUrl
            });

        } catch (error) {
            console.error("❌ Error al subir la imagen:", error);
            res.status(500).json({ error: "Error en el servidor al subir la imagen." });
        }
    });

    // 📌 Endpoint para obtener imágenes por usuario
    app.get("/imagenes/:nss", async (req, res) => {
        try {
            const { nss } = req.params;
            const [result] = await db.execute("SELECT url FROM imagenes WHERE usuario_nss = ? ORDER BY id DESC LIMIT 1", [nss]);

            if (result.length === 0) {
                return res.status(404).json({ error: "No se encontraron imágenes para este usuario." });
            }

            res.json({ url: result[0].url });

        } catch (error) {
            console.error("❌ Error al obtener la imagen:", error);
            res.status(500).json({ error: "Error en el servidor al obtener la imagen." });
        }
    });

    // 📌 Endpoint: Registrar usuario
    app.post('/usuarios', async (req, res) => {
        const { nss, nombre, edad, sexo, contraseña } = req.body;

        if (!nss || !nombre || !edad || !sexo || !contraseña) {
            return res.status(400).json({ error: "Todos los campos son obligatorios." });
        }

        // Convertir "M" a "Masculino" y "F" a "Femenino"
        let sexoConvertido = sexo;
        if (sexo.toUpperCase() === "M") sexoConvertido = "Masculino";
        else if (sexo.toUpperCase() === "F") sexoConvertido = "Femenino";

        const valoresPermitidos = ["Masculino", "Femenino", "Otro"];
        if (!valoresPermitidos.includes(sexoConvertido)) {
            return res.status(400).json({ error: "El campo 'sexo' solo puede ser 'Masculino', 'Femenino' o 'Otro'." });
        }

        try {
            const query = "INSERT INTO usuarios (nss, nombre, edad, sexo, contraseña) VALUES (?, ?, ?, ?, ?)";
            const values = [nss, nombre, edad, sexoConvertido, contraseña];
            await db.execute(query, values);

            res.status(201).json({ message: "Usuario registrado correctamente." });

        } catch (error) {
            console.error("Error en el registro:", error);
            res.status(500).json({ error: "Error en el servidor al registrar el usuario." });
        }
    });

    // 📌 Endpoint: Inicio de sesión
    app.post("/login", async (req, res) => {
        try {
            const { nss, contraseña } = req.body;
            if (!nss || !contraseña) {
                return res.status(400).json({ error: "NSS y contraseña son obligatorios." });
            }

            const [result] = await db.execute("SELECT * FROM usuarios WHERE nss = ? AND contraseña = ?", [nss, contraseña]);

            if (result.length === 0) {
                return res.status(401).json({ error: "Credenciales inválidas." });
            }

            res.json({ message: "Inicio de sesión exitoso", usuario: result[0] });
        } catch (error) {
            res.status(500).json({ error: "Error inesperado." });
        }
    });

    app.listen(PORT, () => console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`));
}

iniciarServidor();
