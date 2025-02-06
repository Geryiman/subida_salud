const { Expo } = require("expo-server-sdk");

// Inicializar Expo SDK
const expo = new Expo();

async function enviarNotificacionExpo(tokenExpo, titulo, mensaje) {
    if (!Expo.isExpoPushToken(tokenExpo)) {
        console.error("❌ Token inválido:", tokenExpo);
        return;
    }

    const mensajes = [
        {
            to: tokenExpo,
            sound: "default",
            title: titulo,
            body: mensaje,
            data: { extraData: "Información adicional" },
        },
    ];

    try {
        const respuesta = await expo.sendPushNotificationsAsync(mensajes);
        console.log("📢 Notificación enviada:", respuesta);
    } catch (error) {
        console.error("❌ Error al enviar notificación:", error);
    }
}

module.exports = { enviarNotificacionExpo };
