const admin = require("firebase-admin");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const FIREBASE_JSON_URL = "https://salud-magenes.sfo2.digitaloceanspaces.com/pillpal-c96fc-firebase-adminsdk-fbsvc-0b64e4850c.json";
const JSON_PATH = path.join(__dirname, "firebase-adminsdk.json");

// 📌 Descargar el archivo JSON de Firebase si 
async function descargarFirebaseJson() {
    if (fs.existsSync(JSON_PATH)) {
        console.log("✅ Archivo de credenciales Firebase ya descargado.");
        return;
    }

    try {
        console.log("⬇️ Descargando archivo de credenciales Firebase...");
        const response = await axios.get(FIREBASE_JSON_URL, { responseType: "arraybuffer" });
        fs.writeFileSync(JSON_PATH, response.data);
        console.log("✅ Archivo de credenciales Firebase descargado correctamente.");
    } catch (error) {
        console.error("❌ Error al descargar el archivo JSON de Firebase:", error.message);
        process.exit(1); // Detener la ejecución si hay un error
    }
}

// 📌 Cargar Firebase Admin SDK
async function iniciarFirebase() {
    await descargarFirebaseJson();

    const serviceAccount = require(JSON_PATH);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });

    console.log("🚀 Firebase Admin SDK inicializado correctamente.");
}

iniciarFirebase();

module.exports = admin;
