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

const certPath = "./ca-certificate.crt"; // Ruta del certificado SSL

// 📌 Función para descargar el certificado SSL automáticamente
async function descargarCertificado() {
    try {
        const url = "https://salud-magenes.sfo2.digitaloceanspaces.com/ca-certificate.crt";
        const response = await axios.get(url, { responseType: "arraybuffer" });
        fs.writeFileSync(certPath, response.data);
        console.log("✅ Certificado SSL descargado correctamente.");
    } catch (error) {
        console.error("❌ Error descargando el certificado SSL:", error);
        process.exit(1); // Salir si no se puede descargar el certificado
    }
}

// 📌 Descarga el certificado y luego inicia el servidor
async function iniciarServidor() {
    await descargarCertificado();

    // 📌 Configuración de la Base de Datos MySQL con SSL
    const db = mysql.createConnection({
        host: "db-mysql-app-salud-do-user-18905968-0.j.db.ondigitalocean.com",
        user: "doadmin",
        password: "AVNS_eC3dTdiST4fJ0_6la0r",
        database: "salud_app_db",
        port: 25060,
        ssl: { ca: fs.readFileSync(certPath) } // Carga el certificado SSL descargado
    });

    db.connect(err => {
        if (err) {
            console.error("❌ Error conectando a MySQL:", err);
            process.exit(1);
        } else {
            console.log("✅ Conectado a MySQL con SSL");
        }
    });

    // 📌 Configuración de DigitalOcean Spaces
    const spacesEndpoint = new aws.Endpoint("https://salud-magenes.sfo2.digitaloceanspaces.com");
    const s3 = new aws.S3({
        endpoint: spacesEndpoint,
        accessKeyId: "DO801LTEURCEU7UEUYVJ",
        secretAccessKey: "TU_SECRET_ACCESS_KEY"
    });

    const upload = multer({
        storage: multerS3({
            s3: s3,
            bucket: "salud-magenes",
            acl: "public-read",
            key: (req, file, cb) => {
                const fileName = `imagenes/${Date.now()}-${file.originalname}`;
                cb(null, fileName);
            }
        })
    });

    // 📌 Rutas del API
    app.get("/", (req, res) => {
        console.log("🚀 Funcionando al 1000%");
        res.send("¡El servidor está funcionando al 1000%!");
    });

    app.get("/health", (req, res) => {
        res.status(200).json({ status: "ok", message: "Health check passed!" });
    });

    app.post("/login", (req, res) => {
        const { nss, contraseña } = req.body;
        console.log(`[LOGIN] Intento de inicio de sesión para NSS: ${nss}`);

        // Validar que se proporcionen NSS y contraseña
        if (!nss || !contraseña) {
            console.error("[LOGIN] NSS o contraseña no proporcionados.");
            return res.status(400).json({ error: "NSS y contraseña son obligatorios." });
        }

        db.query("SELECT * FROM usuarios WHERE nss = ? AND contraseña = ?", [nss, contraseña], (err, result) => {
            if (err) {
                console.error(`[LOGIN] Error de MySQL: ${err}`);
                return res.status(500).json({ error: "Error interno del servidor." });
            }

            if (result.length === 0) {
                console.log(`[LOGIN] Credenciales inválidas para NSS: ${nss}`);
                return res.status(401).json({ error: "Credenciales inválidas." });
            }

            console.log(`[LOGIN] Inicio de sesión exitoso para NSS: ${nss}`);
            res.json({
                message: "Inicio de sesión exitoso",
                usuario: result[0]
            });
        });
    });

    app.post("/imagenes", upload.single("imagen"), (req, res) => {
        console.log("[IMAGENES] Solicitud para subir imagen recibida.");
        const { usuario_nss, tipo, descripcion } = req.body;
        console.log(`[IMAGENES] Datos recibidos: usuario_nss=${usuario_nss}, tipo=${tipo}, descripcion=${descripcion}`);

        if (!req.file) {
            console.error("[IMAGENES] No se recibió un archivo.");
            return res.status(400).json({ error: "No se recibió un archivo." });
        }

        const url = req.file.location;

        db.query("INSERT INTO imagenes (usuario_nss, tipo, url, descripcion) VALUES (?, ?, ?, ?)",
            [usuario_nss, tipo, url, descripcion],
            (err, result) => {
                if (err) {
                    console.error(`[IMAGENES] Error de MySQL: ${err}`);
                    return res.status(500).json({ error: "Error interno del servidor." });
                }
                console.log(`[IMAGENES] Imagen subida con éxito: ${url}`);
                res.json({ message: "Imagen subida", url });
            }
        );
    });

    app.get("/imagenes/:nss", (req, res) => {
        const { nss } = req.params;
        console.log(`[IMAGENES] Solicitud para obtener imágenes de NSS: ${nss}`);

        db.query("SELECT * FROM imagenes WHERE usuario_nss = ?", [nss], (err, result) => {
            if (err) {
                console.error(`[IMAGENES] Error de MySQL: ${err}`);
                return res.status(500).json({ error: "Error interno del servidor." });
            }
            console.log(`[IMAGENES] Imágenes encontradas para NSS: ${nss}`);
            res.json(result);
        });
    });

    // Iniciar el servidor
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`);
    });
}

// 📌 Inicia el servidor después de descargar el certificado
iniciarServidor();
