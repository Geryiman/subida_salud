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
        connectionLimit: 500,
        queueLimit: 0
    });

    console.log("✅ Conectado a MySQL con SSL");

    // 📌 Configuración de DigitalOcean Spaces
    const s3Client = new S3Client({
        endpoint: "https://sfo2.digitaloceanspaces.com",
        region: "sfo2",
        credentials: {
            accessKeyId: "DO00F92NFGUU9UR29VYV", // 🔥 Credenciales visibles (NO recomendado en producción)
            secretAccessKey: "pr0SzcMGY9zK/TaqelriS6oZJU+D/3K5CHsM7qDyYZU"
        }
    });

    app.post('/usuarios', async (req, res) => {
        const { nss, nombre, edad, sexo, contraseña } = req.body;
    
        // Validación de campos
        if (!nss || !nombre || !edad || !sexo || !contraseña) {
            return res.status(400).json({ error: "Todos los campos son obligatorios." });
        }
    
        // Validar que el NSS tenga exactamente 11 dígitos
        if (nss.length !== 11) {
            return res.status(400).json({ error: "El NSS debe tener exactamente 11 dígitos." });
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
            // Insertar el usuario en la base de datos
            const query = "INSERT INTO usuarios (nss, nombre, edad, sexo, contraseña) VALUES (?, ?, ?, ?, ?)";
            const values = [nss, nombre, edad, sexoConvertido, contraseña];
            await db.execute(query, values);
    
            res.status(201).json({ message: "Usuario registrado correctamente." });
        } catch (error) {
            console.error("❌ Error en el registro:", error);
            res.status(500).json({ error: "Error en el servidor al registrar el usuario." });
        }
    });

    app.post('/login', async (req, res) => {
        const { nss, contraseña } = req.body;
    
        // Validación de campos
        if (!nss || !contraseña) {
            return res.status(400).json({ error: "NSS y contraseña son obligatorios." });
        }
    
        try {
            // Verificar credenciales en la base de datos
            const [result] = await db.execute("SELECT * FROM usuarios WHERE nss = ? AND contraseña = ?", [nss, contraseña]);
    
            if (result.length === 0) {
                return res.status(401).json({ error: "Credenciales inválidas." });
            }
    
            const usuario = result[0];
            res.json({
                message: "Inicio de sesión exitoso",
                usuario: {
                    nss: usuario.nss,
                    nombre: usuario.nombre,
                    edad: usuario.edad,
                    sexo: usuario.sexo,
                }
            });
        } catch (error) {
            console.error("❌ Error en el inicio de sesión:", error);
            res.status(500).json({ error: "Error en el servidor al iniciar sesión." });
        }
    });

    
    // 📌 Configuración de Multer para manejar archivos en memoria
    const storage = multer.memoryStorage();
    const upload = multer({ storage: storage });

    app.post("/perfil", multer().single("imagen"), async (req, res) => {
        try {
            const { usuario_nss } = req.body;
            if (!req.file) return res.status(400).json({ error: "No se recibió un archivo." });
            
            const [oldImage] = await db.execute(
                "SELECT url FROM imagenes WHERE usuario_nss = ? AND tipo = 'perfil' ORDER BY id DESC LIMIT 1",
                [usuario_nss]
            );
            
            const key = `imagenes/${Date.now()}-${req.file.originalname}`;
            const uploadParams = {
                Bucket: "salud-magenes",
                Key: key,
                Body: req.file.buffer,
                ACL: "public-read",
                ContentType: req.file.mimetype
            };
            await s3.upload(uploadParams).promise();
            const imageUrl = `https://salud-magenes.sfo2.digitaloceanspaces.com/${key}`;
            
            if (oldImage.length > 0) {
                const oldKey = oldImage[0].url.split("/").pop();
                await s3.deleteObject({ Bucket: "salud-magenes", Key: `imagenes/${oldKey}` }).promise();
                await db.execute("DELETE FROM imagenes WHERE usuario_nss = ? AND tipo = 'perfil'", [usuario_nss]);
            }
            
            await db.execute(
                "INSERT INTO imagenes (usuario_nss, tipo, url, descripcion) VALUES (?, 'perfil', ?, 'Foto de perfil')",
                [usuario_nss, imageUrl]
            );
            
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


    app.get("/perfil/:nss", async (req, res) => {
        try {
            const { nss } = req.params;
            const [result] = await db.promise().execute(
                "SELECT url FROM imagenes WHERE usuario_nss = ? AND tipo = 'perfil' ORDER BY id DESC LIMIT 1", 
                [nss]
            );

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

    // 📌 Endpoint para obtener la información completa del usuario
app.get("/usuario/:nss", async (req, res) => {
    try {
        const { nss } = req.params;

        // 🔹 Obtener datos del usuario
        const [userResult] = await db.execute("SELECT nombre, edad, sexo FROM usuarios WHERE nss = ?", [nss]);
        if (userResult.length === 0) {
            return res.status(404).json({ error: "Usuario no encontrado." });
        }

        // 🔹 Obtener foto de perfil
        const [imageResult] = await db.execute("SELECT url FROM imagenes WHERE usuario_nss = ? AND tipo = 'perfil'", [nss]);
        const userImage = imageResult.length > 0 ? imageResult[0].url : null;

        res.json({
            nss,
            nombre: userResult[0].nombre,
            edad: userResult[0].edad,
            sexo: userResult[0].sexo,
            fotoPerfil: userImage,
        });

    } catch (error) {
        console.error("❌ Error al obtener la información del usuario:", error);
        res.status(500).json({ error: "Error en el servidor al obtener la información." });
    }
});


    app.listen(PORT, () => console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`));
}

iniciarServidor();
