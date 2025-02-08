const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const fs = require("fs");
const axios = require("axios");
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { enviarNotificacionExpo } = require("./expo-notifications");
const cron = require("node-cron");

let db;


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
        const { nss, contraseña, token_expo } = req.body; // Se agrega `token_expo` a los datos recibidos
    
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
    
            // Si se recibe un token Expo, actualizarlo en la base de datos
            if (token_expo) {
                console.log("ℹ️ Actualizando token Expo...");
                const [updateResult] = await db.execute(
                    "UPDATE usuarios SET token_expo = ? WHERE nss = ?",
                    [token_expo, nss]
                );
    
                if (updateResult.affectedRows > 0) {
                    console.log("✅ Token Expo actualizado correctamente para el usuario:", nss);
                } else {
                    console.warn("⚠️ No se pudo actualizar el token Expo para el usuario:", nss);
                }
            }
    
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

    // 📌 Endpoint para crear tratamientos y generar alarmas iniciales
    app.post("/tratamientos", async (req, res) => {
        const { usuario_nss, nombre_tratamiento, descripcion, medicamentos } = req.body;

        if (!usuario_nss || !nombre_tratamiento || !descripcion || !Array.isArray(medicamentos)) {
            return res.status(400).json({ error: "Datos incompletos. Verifica los campos." });
        }

        try {
            const [tratamiento] = await db.execute(
                "INSERT INTO tratamientos (usuario_nss, nombre_tratamiento, descripcion) VALUES (?, ?, ?)",
                [usuario_nss, nombre_tratamiento, descripcion]
            );

            const tratamientoId = tratamiento.insertId;

            for (const med of medicamentos) {
                const { nombre_medicamento, dosis, hora_inicio, intervalo_horas } = med;

                if (!nombre_medicamento || !dosis || !hora_inicio || !intervalo_horas) {
                    continue;
                }

                const formattedHoraInicio = moment.tz(hora_inicio, "America/Mexico_City").format("YYYY-MM-DD HH:mm:ss");

                const [medicamento] = await db.execute(
                    "INSERT INTO medicamentos (tratamiento_id, nombre_medicamento, dosis, hora_inicio, intervalo_horas) VALUES (?, ?, ?, ?, ?)",
                    [tratamientoId, nombre_medicamento, dosis, formattedHoraInicio, parseFloat(intervalo_horas)]
                );

                const medicamentoId = medicamento.insertId;
                const intervaloMs = parseFloat(intervalo_horas) * 60 * 60 * 1000;

                for (let i = 0; i < 2; i++) {
                    const horaAlarma = new Date(new Date(formattedHoraInicio).getTime() + i * intervaloMs);
                    const formattedHoraAlarma = moment(horaAlarma).format("YYYY-MM-DD HH:mm:ss");

                    await db.execute(
                        "INSERT INTO alarmas (medicamento_id, usuario_nss, hora_programada, estado) VALUES (?, ?, ?, 'Pendiente')",
                        [medicamentoId, usuario_nss, formattedHoraAlarma]
                    );
                }
            }

            res.status(201).json({ message: "Tratamiento guardado con alarmas iniciales." });
        } catch (error) {
            res.status(500).json({ error: "Error al guardar tratamiento." });
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
            `SELECT 
                a.id, 
                DATE_FORMAT(a.hora_programada, '%Y-%m-%d %H:%i:%s') AS hora_programada, 
                a.estado, 
                m.nombre_medicamento
             FROM alarmas a
             JOIN medicamentos m ON a.medicamento_id = m.id
             WHERE a.usuario_nss = ? AND a.estado = 'Pendiente'
             ORDER BY a.hora_programada ASC`,
            [nss]
        );

        res.status(200).json(alarmas);
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



 // 📌 Endpoint para apagar una alarma y generar la siguiente
 app.patch("/alarmas/:id/apagar", async (req, res) => {
    const { id } = req.params;

    try {
        const [alarma] = await db.execute(
            `SELECT a.medicamento_id, a.usuario_nss, a.hora_programada, m.intervalo_horas 
             FROM alarmas a
             JOIN medicamentos m ON a.medicamento_id = m.id
             WHERE a.id = ?`,
            [id]
        );

        if (alarma.length === 0) {
            return res.status(404).json({ error: "No se encontró la alarma." });
        }

        const { medicamento_id, usuario_nss, hora_programada, intervalo_horas } = alarma[0];

        await db.execute("UPDATE alarmas SET estado = 'Tomada' WHERE id = ?", [id]);

        const [alarmasRestantes] = await db.execute(
            "SELECT COUNT(*) AS total FROM alarmas WHERE medicamento_id = ? AND estado = 'Pendiente'",
            [medicamento_id]
        );

        if (alarmasRestantes[0].total === 1) {
            const nuevaHora = new Date(new Date(hora_programada).getTime() + intervalo_horas * 60 * 60 * 1000);
            const formattedNuevaHora = moment(nuevaHora).format("YYYY-MM-DD HH:mm:ss");

            await db.execute(
                "INSERT INTO alarmas (medicamento_id, usuario_nss, hora_programada, estado) VALUES (?, ?, ?, 'Pendiente')",
                [medicamento_id, usuario_nss, formattedNuevaHora]
            );
        }

        res.status(200).json({ message: "Alarma apagada exitosamente." });
    } catch (error) {
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
    
        // Validar que los datos requeridos están presentes
        console.log("📩 Datos recibidos en /registrar-token:", { nss, token_expo });
    
        if (!nss || !token_expo) {
            console.warn("⚠️ Faltan datos: NSS y token_expo son obligatorios.");
            return res.status(400).json({ error: "Faltan datos: NSS y token_expo son obligatorios." });
        }
    
        try {
            // Validar formato del NSS (por ejemplo, debe ser de 11 dígitos)
            if (!/^\d{11}$/.test(nss)) {
                console.warn("⚠️ NSS no válido:", nss);
                return res.status(400).json({ error: "El NSS debe tener exactamente 11 dígitos." });
            }
    
            // Validar formato del token Expo (puedes ajustar la expresión según sea necesario)
            if (!/^ExponentPushToken\[.+\]$/.test(token_expo)) {
                console.warn("⚠️ Token Expo no válido:", token_expo);
                return res.status(400).json({ error: "El token Expo no tiene el formato válido." });
            }
    
            // Actualizar el token Expo en la base de datos
            const [result] = await db.execute(
                "UPDATE usuarios SET token_expo = ? WHERE nss = ?",
                [token_expo, nss]
            );
    
            console.log("✅ Resultado de la actualización:", result);
    
            // Verificar si el NSS existe en la base de datos
            if (result.affectedRows === 0) {
                console.warn("⚠️ Usuario no encontrado con NSS:", nss);
                return res.status(404).json({ error: "Usuario no encontrado." });
            }
    
            res.status(200).json({ message: "Token Expo registrado exitosamente." });
        } catch (error) {
            // Manejo de errores en la base de datos o el servidor
            console.error("❌ Error al registrar token Expo:", error);
            res.status(500).json({ error: "Error en el servidor al registrar el token Expo." });
        }
    });
    
    
// 📌 Cron job para verificar alarmas pendientes y enviar notificaciones
cron.schedule("* * * * *", async () => {
    console.log("⏰ Verificando alarmas pendientes...");

    try {
        const ahora = new Date().toISOString().slice(0, 19).replace("T", " ");
        const [alarmasPendientes] = await db.execute(
            `SELECT a.id, a.usuario_nss, a.hora_programada, m.nombre_medicamento, 
                    m.id AS medicamento_id, m.intervalo_horas, u.token_expo
             FROM alarmas a
             JOIN usuarios u ON a.usuario_nss = u.nss
             JOIN medicamentos m ON a.medicamento_id = m.id
             WHERE a.estado = 'Pendiente' AND a.hora_programada <= ?
             ORDER BY a.hora_programada ASC`,
            [ahora]
        );

        for (const alarma of alarmasPendientes) {
            const { id, usuario_nss, hora_programada, medicamento_id, intervalo_horas, token_expo, nombre_medicamento } = alarma;

            if (token_expo) {
                console.log(`📢 Enviando notificación a ${usuario_nss} para la alarma ${id}...`);
                
                await enviarNotificacionExpo(
                    token_expo,
                    "¡Es hora de tomar tu medicamento! 💊",
                    `Recuerda tomar ${nombre_medicamento} ahora.`,
                    { tipo: "alarma", id_alarma: id }
                );

                // 📌 Marcar la alarma como "Notificada"
                await db.execute("UPDATE alarmas SET estado = 'Notificada' WHERE id = ?", [id]);
            } else {
                console.warn(`⚠ El usuario ${usuario_nss} no tiene token Expo, no se enviará notificación.`);
            }

            // 📌 Verificar cuántas alarmas quedan para este medicamento
            const [alarmasRestantes] = await db.execute(
                "SELECT COUNT(*) AS total FROM alarmas WHERE medicamento_id = ? AND estado = 'Pendiente'",
                [medicamento_id]
            );

            if (alarmasRestantes[0].total === 1) {
                console.log(`⚠ Solo queda una alarma. Generando 5 nuevas...`);

                const ultimaHora = new Date(hora_programada);
                const intervaloMs = intervalo_horas * 60 * 60 * 1000;

                for (let i = 1; i <= 5; i++) {
                    const nuevaHora = new Date(ultimaHora.getTime() + i * intervaloMs);
                    const formattedNuevaHora = moment(nuevaHora).format("YYYY-MM-DD HH:mm:ss");

                    await db.execute(
                        "INSERT INTO alarmas (medicamento_id, usuario_nss, hora_programada, estado) VALUES (?, ?, ?, 'Pendiente')",
                        [medicamento_id, usuario_nss, formattedNuevaHora]
                    );

                    console.log(`✅ Nueva alarma programada para: ${formattedNuevaHora}`);
                }
            }
        }

        if (alarmasPendientes.length === 0) {
            console.log("✅ No hay alarmas pendientes en este momento.");
        }
    } catch (error) {
        console.error("❌ Error al verificar o enviar notificaciones:", error);
    }
});
async function enviarNotificacionExpo(token, title, body, data = {}) {
    const message = {
        to: token,
        sound: "default",
        title,
        body,
        priority: "high", // 🔥 Hace que la notificación llegue incluso si el teléfono está bloqueado
        data,
    };

    console.log("📤 Enviando notificación push:", message);

    try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(message),
        });

        const result = await response.json();
        console.log("📢 Notificación enviada:", result);

        // 📌 Si el dispositivo ya no está registrado, eliminamos el token
        if (result?.data?.errors && result.data.errors[0]?.details?.error === "DeviceNotRegistered") {
            console.log(`⚠ Eliminando token inválido: ${token}`);
            await db.execute("UPDATE usuarios SET token_expo = NULL WHERE token_expo = ?", [token]);
        }

    } catch (error) {
        console.error("❌ Error al enviar notificación:", error);
    }
}


// ENPOINT PARA OBTENER LOS DATOS DE TODOS LOS USUARIOS
app.get("/administrador/usuarios", async (req, res) => {
    try {
        const [usuarios] = await db.execute("SELECT id, nss, nombre, edad, sexo FROM usuarios");
        res.status(200).json(usuarios);
    } catch (error) {
        console.error("❌ Error al obtener usuarios:", error);
        res.status(500).json({ error: "Error al obtener usuarios." });
    }
});



// 📌 Endpoint para obtener datos de un usuario y sus medicamentos

app.get("/administrador/usuario/:nss", async (req, res) => {
    const { nss } = req.params;

    try {
        // Obtener datos del usuario
        const [usuario] = await db.execute("SELECT nombre, edad, sexo FROM usuarios WHERE nss = ?", [nss]);
        if (usuario.length === 0) {
            return res.status(404).json({ error: "Usuario no encontrado." });
        }

        // Obtener la última foto de perfil
        const [fotoPerfil] = await db.execute(
            "SELECT url FROM imagenes WHERE usuario_nss = ? AND tipo = 'perfil' ORDER BY id DESC LIMIT 1",
            [nss]
        );

        // Obtener medicamentos relacionados con el usuario
        const [medicamentos] = await db.execute(
            `SELECT 
                m.id AS medicamento_id,
                m.nombre_medicamento,
                m.dosis,
                m.hora_inicio,
                m.intervalo_horas
             FROM medicamentos m
             JOIN tratamientos t ON m.tratamiento_id = t.id
             WHERE t.usuario_nss = ?`,
            [nss]
        );

        // Crear un diccionario para acceder rápidamente a los medicamentos por su ID
        const medicamentosDict = {};
        medicamentos.forEach((med) => {
            medicamentosDict[med.medicamento_id] = med;
        });

        // Obtener alarmas relacionadas con el usuario
        const [alarmas] = await db.execute(
            `SELECT 
                a.id AS alarma_id,
                a.medicamento_id,
                a.hora_programada,
                a.imagen_prueba
             FROM alarmas a
             WHERE a.usuario_nss = ? AND a.imagen_prueba IS NOT NULL`,
            [nss]
        );

        // Enriquecer las alarmas con la información de los medicamentos
        const alarmasConDetalles = alarmas.map((alarma) => {
            const medicamento = medicamentosDict[alarma.medicamento_id] || {};
            return {
                ...alarma,
                nombre_medicamento: medicamento.nombre_medicamento || "Desconocido",
                dosis: medicamento.dosis || "No especificada",
                hora_inicio: medicamento.hora_inicio || "No especificada",
                intervalo_horas: medicamento.intervalo_horas || "No especificado",
            };
        });

        res.json({
            usuario: usuario[0],
            fotoPerfil: fotoPerfil.length > 0 ? fotoPerfil[0].url : null,
            medicamentos,
            alarmas: alarmasConDetalles,
        });
    } catch (error) {
        console.error("❌ Error al obtener datos del usuario:", error);
        res.status(500).json({ error: "Error al obtener datos del usuario." });
    }
});

// ENPOINT PARA ELIMINAR DATOS DE UN USUARIO
app.delete("/administrador/usuario/:nss", async (req, res) => {
    const { nss } = req.params;

    try {
        // Verificar si el usuario existe
        const [usuario] = await db.execute("SELECT * FROM usuarios WHERE nss = ?", [nss]);
        if (usuario.length === 0) {
            return res.status(404).json({ error: "Usuario no encontrado." });
        }

        // Eliminar alarmas del usuario
        await db.execute(
            "DELETE a FROM alarmas a JOIN medicamentos m ON a.medicamento_id = m.id WHERE m.tratamiento_id IN (SELECT id FROM tratamientos WHERE usuario_nss = ?)",
            [nss]
        );

        // Eliminar medicamentos del usuario
        await db.execute(
            "DELETE m FROM medicamentos m WHERE m.tratamiento_id IN (SELECT id FROM tratamientos WHERE usuario_nss = ?)",
            [nss]
        );

        // Eliminar tratamientos del usuario
        await db.execute("DELETE FROM tratamientos WHERE usuario_nss = ?", [nss]);

        // Obtener URLs de las imágenes del usuario antes de eliminarlas
        const [imagenes] = await db.execute("SELECT url FROM imagenes WHERE usuario_nss = ?", [nss]);
        const keys = imagenes.map((img) => img.url.split("https://salud-magenes.sfo2.digitaloceanspaces.com/")[1]);

        // Eliminar imágenes del usuario en DigitalOcean Spaces
        for (const key of keys) {
            try {
                const deleteParams = { Bucket: "salud-magenes", Key: key };
                await s3Client.send(new DeleteObjectCommand(deleteParams));
                console.log(`✅ Imagen eliminada: ${key}`);
            } catch (error) {
                console.error(`❌ Error al eliminar imagen: ${key}`, error);
            }
        }

        // Eliminar imágenes del usuario en la base de datos
        await db.execute("DELETE FROM imagenes WHERE usuario_nss = ?", [nss]);

        // Finalmente, eliminar el usuario
        await db.execute("DELETE FROM usuarios WHERE nss = ?", [nss]);

        res.status(200).json({ message: "Usuario y todos sus datos relacionados han sido eliminados exitosamente." });
    } catch (error) {
        console.error("❌ Error al eliminar usuario:", error);
        res.status(500).json({ error: "Error al eliminar el usuario." });
    }
});



    app.listen(PORT, () => console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`));
}

iniciarServidor();

