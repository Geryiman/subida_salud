const mysql = require("mysql2");
const bcrypt = require("bcrypt");
require("dotenv").config();

// Configuración de la base de datos
const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "salud_app",
});

// Usuarios de prueba
const usuarios = [
  { nombre: "Jefe Prueba", telefono: "1234567890", contrasena: "jefe123", rol: "jefe" },
  { nombre: "Admin Prueba 1", telefono: "0987654321", contrasena: "admin123", rol: "administrador" },
  { nombre: "Admin Prueba 2", telefono: "1122334455", contrasena: "admin456", rol: "administrador" },
];

// Función para insertar usuarios
const insertarUsuarios = async () => {
  try {
    for (let usuario of usuarios) {
      const hashedPassword = await bcrypt.hash(usuario.contrasena, 10); // Cifrar contraseña
      const query = `INSERT INTO usuarios (nombre, telefono, contrasena, rol) VALUES (?, ?, ?, ?)`;

      db.query(query, [usuario.nombre, usuario.telefono, hashedPassword, usuario.rol], (err, result) => {
        if (err) {
          console.error("Error al insertar usuario:", err);
        } else {
          console.log(`Usuario ${usuario.nombre} insertado correctamente`);
        }
      });
    }
  } catch (err) {
    console.error("Error al procesar los usuarios:", err);
  } finally {
    db.end();
  }
};

// Llamar a la función
insertarUsuarios();
