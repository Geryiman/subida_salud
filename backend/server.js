const express = require("express");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();
const app = express();

app.use(express.json());
app.use(cors());

// Configuración de la base de datos
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: true }, // Habilita SSL
});


// Conexión a la base de datos
db.connect((err) => {
  if (err) {
    console.error("Error conectando a la base de datos:", err);
    return;
  }
  console.log("Conectado a la base de datos MySQL");
});

// Rutas
app.post("/login", (req, res) => {
  const { nombre, contrasena } = req.body;

  if (!nombre || !contrasena) {
    return res.status(400).json({ error: "Todos los campos son obligatorios" });
  }

  const query = "SELECT * FROM usuarios WHERE nombre = ?";
  db.query(query, [nombre], (err, results) => {
    if (err) {
      return res.status(500).json({ error: "Error del servidor" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const user = results[0];
    bcrypt.compare(contrasena, user.contrasena, (err, isMatch) => {
      if (err || !isMatch) {
        return res.status(401).json({ error: "Credenciales inválidas" });
      }

      const token = jwt.sign({ id: user.id, rol: user.rol }, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });

      res.json({ token, user: { id: user.id, nombre: user.nombre, rol: user.rol } });
    });
  });
});

app.post("/add-user", async (req, res) => {
  const { nombre, telefono, contrasena, rol } = req.body;

  if (!nombre || !telefono || !contrasena || !rol) {
    return res.status(400).json({ error: "Todos los campos son obligatorios" });
  }

  if (!["jefe", "administrador"].includes(rol)) {
    return res.status(400).json({ error: "El rol debe ser 'jefe' o 'administrador'" });
  }

  try {
    const hashedPassword = await bcrypt.hash(contrasena, 10);

    const query = `INSERT INTO usuarios (nombre, telefono, contrasena, rol) VALUES (?, ?, ?, ?)`;
    db.query(query, [nombre, telefono, hashedPassword, rol], (err) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") {
          return res.status(409).json({ error: "El teléfono ya está registrado" });
        }
        return res.status(500).json({ error: "Error del servidor" });
      }
      res.status(201).json({ message: "Usuario agregado exitosamente" });
    });
  } catch (err) {
    res.status(500).json({ error: "Error al procesar la solicitud" });
  }
});

app.get("/api/administradores", (req, res) => {
  const query = "SELECT id, nombre, telefono, rol, fecha_registro FROM usuarios WHERE rol IN ('administrador', 'jefe')";
  db.query(query, (err, results) => {
    if (err) {
      console.error("Error al obtener administradores:", err);
      return res.status(500).json({ error: "Error al obtener administradores" });
    }
    res.json(results);
  });
});

app.get("/api/pacientes", (req, res) => {
  const sql = "SELECT id, nombre_completo, edad, nss, telefono, foto_perfil FROM pacientes";
  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error al obtener pacientes:", err);
      return res.status(500).json({ error: "Error al obtener pacientes" });
    }
    res.json(results);
  });
});

app.delete("/api/administradores/:id", (req, res) => {
  const { id } = req.params;
  const query = "DELETE FROM usuarios WHERE id = ?";

  db.query(query, [id], (err, result) => {
    if (err) {
      console.error("Error al eliminar el administrador:", err);
      return res.status(500).json({ error: "Error al eliminar el administrador" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Administrador no encontrado" });
    }

    res.json({ message: "Administrador eliminado exitosamente" });
  });
});

// Arrancar el servidor
const PORT = process.env.PORT || 4000;
app.listen(DB_PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
