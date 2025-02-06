const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const fs = require("fs");
const axios = require("axios");
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { enviarNotificacionExpo } = require("./expo-notifications");

const app = express();
const PORT = process.env.PORT || 3000;
const moment = require("moment-timezone");

app.use(cors());
app.use(bodyParser.json());
const router = express.Router();

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

    app.post("/tratamientos", async (req, res) => {
        const { usuario_nss, nombre_tratamiento, descripcion, medicamentos } = req.body;

        if (!usuario_nss || !nombre_tratamiento || !descripcion || !Array.isArray(medicamentos)) {
            return res.status(400).json({ error: "Datos incompletos. Verifica el NSS, nombre del tratamiento, descripción y medicamentos." });
        }

        try {
            console.log("Datos recibidos en el backend:", { usuario_nss, nombre_tratamiento, descripcion, medicamentos });

            const [tratamiento] = await db.execute(
                "INSERT INTO tratamientos (usuario_nss, nombre_tratamiento, descripcion) VALUES (?, ?, ?)",
                [usuario_nss, nombre_tratamiento, descripcion]
            );

            const tratamientoId = tratamiento.insertId;
            console.log("Tratamiento guardado con ID:", tratamientoId);

            for (const med of medicamentos) {
                const { nombre_medicamento, dosis, hora_inicio, intervalo_horas } = med;

                if (!nombre_medicamento || !dosis || !hora_inicio || !intervalo_horas) {
                    console.error("⚠ Medicamento con datos incompletos:", med);
                    continue;
                }

                // Convertir hora_inicio a la zona horaria de México
                let horaInicio = null;

                if (/^\d{2}:\d{2}:\d{2}$/.test(hora_inicio)) {
                    // Si solo tenemos HH:mm:ss, añadimos la fecha actual
                    const currentDate = moment().tz("America/Mexico_City").format("YYYY-MM-DD");
                    horaInicio = moment.tz(`${currentDate} ${hora_inicio}`, "America/Mexico_City").toDate();
                } else {
                    horaInicio = moment.tz(hora_inicio, "America/Mexico_City").toDate();
                }

                if (isNaN(horaInicio.getTime())) {
                    console.error("❌ No se pudo interpretar la hora_inicio:", hora_inicio);
                    continue;
                }

                const formattedHoraInicio = moment(horaInicio).tz("America/Mexico_City").format("YYYY-MM-DD HH:mm:ss");

                const [medicamento] = await db.execute(
                    "INSERT INTO medicamentos (tratamiento_id, nombre_medicamento, dosis, hora_inicio, intervalo_horas) VALUES (?, ?, ?, ?, ?)",
                    [tratamientoId, nombre_medicamento, dosis, formattedHoraInicio, parseFloat(intervalo_horas)]
                );

                const medicamentoId = medicamento.insertId;

                // Generar alarmas
                const intervaloMs = parseFloat(intervalo_horas) * 60 * 60 * 1000;
                for (let i = 0; i < 5; i++) {
                    const horaAlarma = new Date(horaInicio.getTime() + i * intervaloMs);
                    const formattedHoraAlarma = moment(horaAlarma).tz("America/Mexico_City").format("YYYY-MM-DD HH:mm:ss");

                    await db.execute(
                        "INSERT INTO alarmas (medicamento_id, usuario_nss, hora_programada) VALUES (?, ?, ?)",
                        [medicamentoId, usuario_nss, formattedHoraAlarma]
                    );
                    console.log("Alarma generada:", formattedHoraAlarma);
                }
            }

            res.status(201).json({ message: "Tratamiento y medicamentos guardados exitosamente." });

        } catch (error) {
            console.error("❌ Error al guardar tratamiento:", error);
            res.status(500).json({ error: "Error al guardar tratamiento. Intenta nuevamente." });
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

 app.get("/alarmas/:nss", async (req, res) => {
    const { nss } = req.params;

    try {
        // Obtener las alarmas del usuario que están pendientes
        const [alarmas] = await db.execute(
            `SELECT a.id, a.hora_programada, a.estado, m.nombre_medicamento
             FROM alarmas a
             JOIN medicamentos m ON a.id_medicamento = m.id
             WHERE a.usuario_nss = ? AND a.estado = 'Pendiente'
             ORDER BY a.hora_programada ASC`,
            [nss]
        );

        // Verificar si alguna alarma ya pasó su hora programada
        const ahora = new Date();
        const alarmasActualizadas = [];

        for (const alarma of alarmas) {
            const horaProgramada = new Date(alarma.hora_programada);

            if (horaProgramada < ahora) {
                // Reprogramar alarma para 5 minutos después
                const nuevaHora = new Date(ahora.getTime() + 5 * 60 * 1000);
                alarma.hora_programada = nuevaHora.toISOString().slice(0, 19).replace("T", " ");

                // Actualizar la base de datos con la nueva hora
                await db.execute(
                    "UPDATE alarmas SET hora_programada = ? WHERE id = ?",
                    [alarma.hora_programada, alarma.id]
                );
            }

            alarmasActualizadas.push(alarma);
        }

        res.status(200).json(alarmasActualizadas);
    } catch (error) {
        console.error("❌ Error al obtener alarmas:", error);
        res.status(500).json({ error: "Error al obtener alarmas." });
    }
});

    router.post("/imagenes", upload.single("imagen"), async (req, res) => {
        const { usuario_nss } = req.body;

        if (!req.file || !usuario_nss) {
            return res.status(400).json({ error: "Faltan datos: imagen y usuario_nss son obligatorios." });
        }

        try {
            // Generar nombre único para la imagen
            const key = `photos/${usuario_nss}_${Date.now()}.jpg`;

            // Configuración de la subida a Spaces
            const uploadParams = {
                Bucket: "salud-magenes",
                Key: key,
                Body: req.file.buffer,
                ACL: "public-read",
                ContentType: req.file.mimetype,
            };

            // Subir la imagen a Spaces
            await s3Client.send(new PutObjectCommand(uploadParams));

            const imageUrl = `https://salud-magenes.sfo2.digitaloceanspaces.com/${key}`;

            res.status(200).json({
                message: "Imagen subida exitosamente.",
                url: imageUrl,
            });
        } catch (error) {
            console.error("❌ Error al subir imagen:", error);
            res.status(500).json({ error: "Error al subir la imagen a Spaces." });
        }
    });

    router.patch("/alarmas/:id/apagar", async (req, res) => {
        const { id } = req.params;

        try {
            // Actualizar el estado de la alarma como "Tomada"
            const [result] = await db.execute(
                "UPDATE alarmas SET estado = 'Tomada' WHERE id = ?",
                [id]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "No se encontró la alarma." });
            }

            res.status(200).json({ message: "Alarma apagada exitosamente." });
        } catch (error) {
            console.error("❌ Error al apagar la alarma:", error);
            res.status(500).json({ error: "Error al apagar la alarma." });
        }
    });

    // 📌 Endpoint para subir imagen y apagar alarma
    app.post("/alarmas/apagar", upload.single("imagen"), async (req, res) => {
        const { id, usuario_nss } = req.body;

        if (!req.file || !id || !usuario_nss) {
            return res.status(400).json({ error: "Faltan datos: imagen, id de alarma y NSS son obligatorios." });
        }

        try {
            // 🔹 Generar carpeta y nombre del archivo
            const folder = `photos/${usuario_nss}`;
            const fileName = `alarma_${id}_${Date.now()}.jpg`;
            const key = `${folder}/${fileName}`;

            // 🔹 Subir imagen a DigitalOcean Spaces
            const uploadParams = {
                Bucket: "salud-magenes",
                Key: key,
                Body: req.file.buffer,
                ACL: "public-read",
                ContentType: req.file.mimetype,
            };

            await s3Client.send(new PutObjectCommand(uploadParams));
            const imageUrl = `https://salud-magenes.sfo2.digitaloceanspaces.com/${key}`;

            // 🔹 Actualizar la alarma en la base de datos
            const [result] = await db.execute(
                `UPDATE alarmas 
             SET estado = 'Tomada', imagen_prueba = ? 
             WHERE id = ?`,
                [imageUrl, id]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "No se encontró la alarma." });
            }

            res.status(200).json({
                message: "Alarma apagada exitosamente.",
                url: imageUrl,
            });
        } catch (error) {
            console.error("❌ Error al apagar la alarma:", error);
            res.status(500).json({ error: "Error al apagar la alarma." });
        }
    });


    app.post("/alarmas", async (req, res) => {
        const { medicamento_id, usuario_nss, hora_programada } = req.body;
    
        // Validar que todos los campos obligatorios estén presentes
        if (!medicamento_id || !usuario_nss || !hora_programada) {
            return res.status(400).json({ 
                error: "Faltan campos obligatorios: 'medicamento_id', 'usuario_nss', y 'hora_programada' son necesarios." 
            });
        }
    
        try {
            // Validar que la hora programada sea válida
            const horaValida = new Date(hora_programada);
            if (isNaN(horaValida.getTime())) {
                return res.status(400).json({ error: "El campo 'hora_programada' no tiene un formato válido." });
            }
    
            const horaFormateada = horaValida.toISOString().slice(0, 19).replace("T", " "); // Formato `YYYY-MM-DD HH:mm:ss`
    
            // Insertar la alarma en la base de datos
            const [result] = await db.execute(
                "INSERT INTO alarmas (medicamento_id, usuario_nss, hora_programada, estado) VALUES (?, ?, ?, 'Pendiente')",
                [medicamento_id, usuario_nss, horaFormateada]
            );
    
            res.status(201).json({
                message: "Alarma creada exitosamente.",
                alarma: {
                    id: result.insertId,
                    medicamento_id,
                    usuario_nss,
                    hora_programada: horaFormateada,
                    estado: "Pendiente",
                },
            });
        } catch (error) {
            console.error("❌ Error al crear alarma:", error);
            res.status(500).json({ error: "Error al crear la alarma." });
        }
    });
    
    
    app.post("/registrar-token", async (req, res) => {
        const { nss, token_expo } = req.body;
    
        if (!nss || !token_expo) {
            return res.status(400).json({ error: "Faltan datos: NSS y token_expo son obligatorios." });
        }
    
        try {
            // Actualizar el token del usuario basado en el NSS
            const [result] = await db.execute(
                "UPDATE usuarios SET token_expo = ? WHERE nss = ?",
                [token_expo, nss]
            );
    
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "Usuario no encontrado." });
            }
    
            res.json({ message: "Token Expo registrado exitosamente." });
        } catch (error) {
            console.error("❌ Error al registrar token Expo:", error);
            res.status(500).json({ error: "Error en el servidor." });
        }
    });
    




    app.listen(PORT, () => console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`));
}

iniciarServidor();
