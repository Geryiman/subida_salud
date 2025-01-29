const mysql = require('mysql2');
require ("dotenv/config")
const path = require('path');
const fs = require('fs');

const certificate = path.join(__dirname, 'ca-certificate.crt');
const file = fs.readFileSync(certificate);
console.log(certificate)

const db = mysql.createPool({
  host: "db-mysql-app-salud-do-user-18905968-0.j.db.ondigitalocean.com",
  user: "doadmin",
  password: "AVNS_eC3dTdiST4fJ0_6la0r",
  database: "salud_app",
  port: 25060,
  ssl: { ca: file },
});

db.getConnection((err, connection) => {
  if (err) {
    console.error('Error conectando a la base de datos:', err);
  } else {
    console.log('Conectado a MySQL');
    connection.release();
  }
});

module.exports = db;
