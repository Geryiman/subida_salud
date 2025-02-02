const express = require("express");
const mysql = require("mysql2");
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

// 📌 Función para descargar el certificado SSL automáticamente
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
    const db = mysql.createConnection({
        host: "db-mysql-app-salud-do-user-18905968-0.j.db.ondigitalocean.com",
        user: "doadmin",
        password: "AVNS_eC3dTdiST4fJ0_6la0r",
        database: "salud_app_db",
        port: 25060,
        ssl: { ca: fs.readFileSync(certPath) }
    });

    db.connect(err => {
        if (err) {
            console.error("❌ Error conectando a MySQL:", err.message);
            process.exit(1);
        }
        console.log("✅ Conectado a MySQL con SSL");
    });

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

    // 📌 Rutas con mejor control de errores

    app.post("/usuarios", async (req, res) => {
        try {
            const { nss, nombre, edad, sexo, contraseña } = req.body;
            if (!nss || !nombre || !edad || !sexo || !contraseña) {
                return res.status(400).json({ error: "Todos los campos son obligatorios." });
            }
            
            if (!["M", "F"].includes(sexo.toUpperCase())) {
                return res.status(400).json({ error: "El campo 'sexo' solo puede ser 'M' o 'F'." });
            }
            
            db.query("INSERT INTO usuarios (nss, nombre, edad, sexo, contraseña) VALUES (?, ?, ?, ?, ?)",
                [nss, nombre, edad, sexo.toUpperCase(), contraseña],
                (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: "Usuario registrado correctamente." });
                }
            );
        } catch (error) {
            res.status(500).json({ error: "Error inesperado." });
        }
    });

    app.post("/login", (req, res) => {
        try {
            const { nss, contraseña } = req.body;
            if (!nss || !contraseña) {
                return res.status(400).json({ error: "NSS y contraseña son obligatorios." });
            }

            db.query("SELECT * FROM usuarios WHERE nss = ? AND contraseña = ?", [nss, contraseña], (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                if (result.length === 0) return res.status(401).json({ error: "Credenciales inválidas." });
                res.json({ message: "Inicio de sesión exitoso", usuario: result[0] });
            });
        } catch (error) {
            res.status(500).json({ error: "Error inesperado." });
        }
    });

    app.post("/imagenes", upload.single("imagen"), (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: "No se recibió un archivo." });
            const { usuario_nss, tipo, descripcion } = req.body;
            const url = req.file.location;
            db.query("INSERT INTO imagenes (usuario_nss, tipo, url, descripcion) VALUES (?, ?, ?, ?)",
                [usuario_nss, tipo, url, descripcion],
                (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: "Imagen subida con éxito.", url });
                }
            );
        } catch (error) {
            res.status(500).json({ error: "Error inesperado." });
        }
    });

    app.get("/imagenes/:nss", (req, res) => {
        try {
            const { nss } = req.params;
            db.query("SELECT * FROM imagenes WHERE usuario_nss = ?", [nss], (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json(result);
            });
        } catch (error) {
            res.status(500).json({ error: "Error inesperado." });
        }
    });

    app.listen(PORT, () => console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`));
}

iniciarServidor();
