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
const PORT = 3000;

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
        process.exit(1); // Sale del proceso si no puede descargar el certificado
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
    app.post("/usuarios", (req, res) => {
        const { nss, nombre, edad, sexo, contraseña } = req.body;
        db.query("INSERT INTO usuarios (nss, nombre, edad, sexo, contraseña) VALUES (?, ?, ?, ?, ?)",
            [nss, nombre, edad, sexo, contraseña],
            (err, result) => {
                if (err) res.status(500).json({ error: err });
                else res.json({ message: "Usuario registrado" });
            }
        );
    });

    app.post("/login", (req, res) => {
        const { nss, contraseña } = req.body;
        db.query("SELECT * FROM usuarios WHERE nss = ? AND contraseña = ?", [nss, contraseña],
            (err, result) => {
                if (err) res.status(500).json({ error: err });
                else if (result.length === 0) res.status(401).json({ error: "Credenciales inválidas" });
                else res.json({
                    message: "Inicio de sesión exitoso",
                    usuario: result[0]
                });
            }
        );
    });

    app.get("/perfil/:nss", (req, res) => {
        const { nss } = req.params;

        const queryUsuario = "SELECT * FROM usuarios WHERE nss = ?";
        db.query(queryUsuario, [nss], (err, usuarioResult) => {
            if (err) return res.status(500).json({ error: err });
            if (usuarioResult.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });

            let usuario = usuarioResult[0];

            const queryTratamientos = "SELECT * FROM tratamientos WHERE usuario_nss = ?";
            db.query(queryTratamientos, [nss], (err, tratamientosResult) => {
                if (err) return res.status(500).json({ error: err });
                usuario.tratamientos = tratamientosResult;

                const tratamientoIds = tratamientosResult.map(t => t.id);
                if (tratamientoIds.length > 0) {
                    const queryMedicamentos = "SELECT * FROM medicamentos WHERE tratamiento_id IN (?)";
                    db.query(queryMedicamentos, [tratamientoIds], (err, medicamentosResult) => {
                        if (err) return res.status(500).json({ error: err });
                        usuario.medicamentos = medicamentosResult;

                        const queryAlarmas = "SELECT * FROM alarmas WHERE usuario_nss = ?";
                        db.query(queryAlarmas, [nss], (err, alarmasResult) => {
                            if (err) return res.status(500).json({ error: err });
                            usuario.alarmas = alarmasResult;

                            const queryImagenes = "SELECT * FROM imagenes WHERE usuario_nss = ?";
                            db.query(queryImagenes, [nss], (err, imagenesResult) => {
                                if (err) return res.status(500).json({ error: err });
                                usuario.imagenes = imagenesResult;

                                res.json(usuario);
                            });
                        });
                    });
                } else {
                    usuario.medicamentos = [];
                    usuario.alarmas = [];
                    usuario.imagenes = [];
                    res.json(usuario);
                }
            });
        });
    });

    app.post("/imagenes", upload.single("imagen"), (req, res) => {
        const { usuario_nss, tipo, descripcion } = req.body;
        const url = req.file.location;

        db.query("INSERT INTO imagenes (usuario_nss, tipo, url, descripcion) VALUES (?, ?, ?, ?)",
            [usuario_nss, tipo, url, descripcion],
            (err, result) => {
                if (err) res.status(500).json({ error: err });
                else res.json({ message: "Imagen subida", url });
            }
        );
    });

    app.get("/imagenes/:nss", (req, res) => {
        const { nss } = req.params;
        db.query("SELECT * FROM imagenes WHERE usuario_nss = ?", [nss], (err, result) => {
            if (err) res.status(500).json({ error: err });
            else res.json(result);
        });
    });
    app.get('/health', (req, res) => {
      res.status(200).json({ status: 'ok', message: 'Health check passed!' });
  });
  

    // Iniciar el servidor
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`);
  });
  
}


// 📌 Inicia el servidor después de descargar el certificado
iniciarServidor();
