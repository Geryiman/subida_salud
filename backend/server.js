const express = require("express");
const mysql = require("mysql2/promise"); // Importamos la versión basada en promesas
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const aws = require("aws-sdk");
const multerS3 = require("multer-s3");
const fs = require("fs");
const axios = require("axios");

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

    // 📌 Configuración de MySQL con SSL usando Promises
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
    const s3 = new aws.S3({
        endpoint: new aws.Endpoint("https://salud-magenes.sfo2.digitaloceanspaces.com"),
        accessKeyId: "DO801LTEURCEU7UEUYVJ",
        secretAccessKey: "TU_SECRET_ACCESS_KEY"
    });

    const upload = multer({
        storage: multerS3({
            s3: s3,
            bucket: "salud-magenes",
            acl: "public-read",
            key: (req, file, cb) => {
                cb(null, `imagenes/${Date.now()}-${file.originalname}`);
            }
        })
    });

    // 📌 Endpoint: Registrar usuario con corrección de Promises
    app.post('/usuarios', async (req, res) => {
        const { nss, nombre, edad, sexo, contraseña } = req.body;
    
        // Verificar que todos los campos estén presentes
        if (!nss || !nombre || !edad || !sexo || !contraseña) {
            return res.status(400).json({ error: "Todos los campos son obligatorios." });
        }
    
        // Convertir "M" a "Masculino" y "F" a "Femenino"
        let sexoConvertido = sexo;
        if (sexo.toUpperCase() === "M") {
            sexoConvertido = "Masculino";
        } else if (sexo.toUpperCase() === "F") {
            sexoConvertido = "Femenino";
        }
    
        // Validar que el sexo sea "Masculino", "Femenino" o "Otro"
        const valoresPermitidos = ["Masculino", "Femenino", "Otro"];
        if (!valoresPermitidos.includes(sexoConvertido)) {
            return res.status(400).json({ error: "El campo 'sexo' solo puede ser 'Masculino', 'Femenino' o 'Otro'." });
        }
    
        try {
            // Insertar usuario en la base de datos con await
            const query = "INSERT INTO usuarios (nss, nombre, edad, sexo, contraseña) VALUES (?, ?, ?, ?, ?)";
            const values = [nss, nombre, edad, sexoConvertido, contraseña];
    
            await db.execute(query, values);
            return res.status(201).json({ message: "Usuario registrado correctamente." });

        } catch (error) {
            console.error("Error en el registro:", error);
            return res.status(500).json({ error: "Error en el servidor al registrar el usuario." });
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

    // 📌 Endpoint: Subida de imágenes
    app.post("/imagenes", upload.single("imagen"), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: "No se recibió un archivo." });
            const { usuario_nss, tipo, descripcion } = req.body;
            const url = req.file.location;

            await db.execute("INSERT INTO imagenes (usuario_nss, tipo, url, descripcion) VALUES (?, ?, ?, ?)", 
                [usuario_nss, tipo, url, descripcion]);

            res.json({ message: "Imagen subida con éxito.", url });
        } catch (error) {
            res.status(500).json({ error: "Error inesperado." });
        }
    });

    // 📌 Endpoint: Obtener imágenes por usuario
    app.get("/imagenes/:nss", async (req, res) => {
        try {
            const { nss } = req.params;
            const [result] = await db.execute("SELECT * FROM imagenes WHERE usuario_nss = ?", [nss]);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: "Error inesperado." });
        }
    });

    app.listen(PORT, () => console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`));
}

iniciarServidor();
