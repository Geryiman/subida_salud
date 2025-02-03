const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const fs = require("fs");
const axios = require("axios");
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

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

    // 📌 Endpoint para subir y actualizar la foto de perfil del usuario
    app.post("/perfil", upload.single("imagen"), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: "No se recibió un archivo." });

            const { usuario_nss } = req.body;
            if (!usuario_nss) return res.status(400).json({ error: "El usuario_nss es obligatorio." });

            // 🔹 Definir la ruta de la imagen en DigitalOcean Spaces
            const key = `usuario/${usuario_nss}/perfil.jpg`;

            // 🔹 Buscar la imagen existente en la base de datos
            const [existingImage] = await db.execute(
                "SELECT url FROM imagenes WHERE usuario_nss = ? AND tipo = 'perfil' ORDER BY id DESC LIMIT 1",
                [usuario_nss]
            );

            if (existingImage.length > 0) {
                const oldImageUrl = existingImage[0].url;
                const keyToDelete = oldImageUrl.split("https://salud-magenes.sfo2.digitaloceanspaces.com/")[1];

                // 🔹 Eliminar la imagen anterior de DigitalOcean Spaces
                const deleteParams = {
                    Bucket: "salud-magenes",
                    Key: keyToDelete
                };

                try {
                    const deleteCommand = new DeleteObjectCommand(deleteParams);
                    await s3Client.send(deleteCommand);
                    console.log("✅ Imagen anterior eliminada:", keyToDelete);
                } catch (deleteError) {
                    console.error("❌ Error al eliminar la imagen anterior:", deleteError);
                }

                // 🔹 Eliminar la imagen de la base de datos
                await db.execute("DELETE FROM imagenes WHERE usuario_nss = ? AND tipo = 'perfil'", [usuario_nss]);
            }

            // 🔹 Subir la nueva imagen a DigitalOcean Spaces
            const uploadParams = {
                Bucket: "salud-magenes",
                Key: key,
                Body: req.file.buffer,
                ACL: "public-read",
                ContentType: req.file.mimetype
            };

            const uploadCommand = new PutObjectCommand(uploadParams);
            await s3Client.send(uploadCommand);

            const imageUrl = `https://salud-magenes.sfo2.digitaloceanspaces.com/${key}`;

            // 🔹 Guardar la nueva foto en la base de datos
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
            const [userResult] = await db.execute(
                "SELECT nombre, edad, sexo FROM usuarios WHERE nss = ?",
                [nss]
            );

            if (userResult.length === 0) {
                return res.status(404).json({ error: "Usuario no encontrado." });
            }

            // 🔹 Obtener la última foto de perfil
            const [imageResult] = await db.execute(
                "SELECT url FROM imagenes WHERE usuario_nss = ? AND tipo = 'perfil' ORDER BY id DESC LIMIT 1",
                [nss]
            );

            // 🔹 Definir la URL de la imagen
            const userImage = imageResult.length > 0
                ? imageResult[0].url
                : `https://salud-magenes.sfo2.digitaloceanspaces.com/usuario/${nss}/perfil.jpg`;

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

// 📌 Endpoint para registrar tratamientos
app.post("/tratamientos", async (req, res) => {
    const { usuario_nss, nombre_tratamiento, descripcion, medicamentos } = req.body;
    try {
        const [tratamiento] = await db.execute(
            "INSERT INTO tratamientos (usuario_nss, nombre_tratamiento, descripcion) VALUES (?, ?, ?)",
            [usuario_nss, nombre_tratamiento, descripcion]
        );

        const tratamientoId = tratamiento.insertId;

        for (const med of medicamentos) {
            const { nombre_medicamento, dosis, hora_inicio, intervalo_horas } = med;
            const [medicamento] = await db.execute(
                "INSERT INTO medicamentos (tratamiento_id, nombre_medicamento, dosis, hora_inicio, intervalo_horas) VALUES (?, ?, ?, ?, ?)",
                [tratamientoId, nombre_medicamento, dosis, hora_inicio, intervalo_horas]
            );

            const medicamentoId = medicamento.insertId;
            const horaInicio = new Date(`1970-01-01T${hora_inicio}Z`);

            for (let i = 0; i < 5; i++) {
                const horaAlarma = new Date(horaInicio.getTime() + i * intervalo_horas * 60 * 60 * 1000);
                await db.execute(
                    "INSERT INTO alarmas (medicamento_id, usuario_nss, hora_programada) VALUES (?, ?, ?)",
                    [medicamentoId, usuario_nss, horaAlarma]
                );
            }
        }

        res.status(201).json({ message: "Tratamiento y alarmas generados exitosamente." });
    } catch (error) {
        console.error("❌ Error al registrar tratamiento:", error);
        res.status(500).json({ error: "Error al registrar tratamiento." });
    }
});

// 📌 Endpoint para obtener tratamientos por usuario
app.get("/tratamientos/:nss", async (req, res) => {
    const { nss } = req.params;
    try {
        const [tratamientos] = await db.execute(
            "SELECT * FROM tratamientos WHERE usuario_nss = ?",
            [nss]
        );

        for (const tratamiento of tratamientos) {
            const [medicamentos] = await db.execute(
                "SELECT * FROM medicamentos WHERE tratamiento_id = ?",
                [tratamiento.id]
            );
            tratamiento.medicamentos = medicamentos;
        }

        res.json(tratamientos);
    } catch (error) {
        console.error("❌ Error al obtener tratamientos:", error);
        res.status(500).json({ error: "Error al obtener tratamientos." });
    }
});

// 📌 Endpoint para obtener alarmas por usuario
app.get("/alarmas/:nss", async (req, res) => {
    const { nss } = req.params;
    try {
        const [alarmas] = await db.execute(
            `SELECT a.id, a.hora_programada, a.estado, m.nombre_medicamento
             FROM alarmas a
             JOIN medicamentos m ON a.medicamento_id = m.id
             WHERE a.usuario_nss = ? AND a.estado = 'Pendiente'
             ORDER BY a.hora_programada ASC`,
            [nss]
        );

        res.json(alarmas);
    } catch (error) {
        console.error("❌ Error al obtener alarmas:", error);
        res.status(500).json({ error: "Error al obtener alarmas." });
    }
});

// 📌 Endpoint para apagar una alarma con foto
app.patch("/alarmas/:id", upload.single("imagen"), async (req, res) => {
    const { id } = req.params;
    const { usuario_nss } = req.body;

    if (!req.file) {
        return res.status(400).json({ error: "Se requiere una imagen para apagar la alarma." });
    }

    try {
        const [alarma] = await db.execute(
            `SELECT a.id, a.hora_programada, m.nombre_medicamento, u.nombre
             FROM alarmas a
             JOIN medicamentos m ON a.medicamento_id = m.id
             JOIN usuarios u ON a.usuario_nss = u.nss
             WHERE a.id = ? AND a.usuario_nss = ?`,
            [id, usuario_nss]
        );

        if (alarma.length === 0) {
            return res.status(404).json({ error: "No se encontró la alarma o ya fue tomada." });
        }

        const key = `imagenes/alarmas/${usuario_nss}_${Date.now()}.jpg`;

        const uploadParams = {
            Bucket: "salud-magenes",
            Key: key,
            Body: req.file.buffer,
            ACL: "public-read",
            ContentType: req.file.mimetype
        };
        await s3Client.send(new PutObjectCommand(uploadParams));

        const imageUrl = `https://salud-magenes.sfo2.digitaloceanspaces.com/${key}`;

        await db.execute(
            "UPDATE alarmas SET estado = 'Tomada', descripcion = ?, imagen_prueba = ? WHERE id = ?",
            [
                `Foto tomada por ${alarma[0].nombre} para el medicamento ${alarma[0].nombre_medicamento} a las ${alarma[0].hora_programada}`,
                imageUrl,
                id
            ]
        );

        res.status(200).json({
            message: "Alarma apagada exitosamente.",
            url: imageUrl
        });
    } catch (error) {
        console.error("❌ Error al apagar alarma:", error);
        res.status(500).json({ error: "Error al apagar la alarma." });
    }
});

    app.listen(PORT, () => console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`));
}

iniciarServidor();
