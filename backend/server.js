require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/db');

// Rutas
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const treatmentRoutes = require('./routes/treatmentRoutes');

const app = express();

// Middlewares
app.use(cors({
    origin: 'http://localhost:3000', // Sin espacios extra
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true, // Habilita cookies o tokens en solicitudes cruzadas
}));
app.use(express.json());

// Ruta principal
app.get("/", (req, res) => {
    res.send("Funciona la API 12x1");
});

// Rutas específicas
app.use('/auth', authRoutes); 
app.use('/users', userRoutes);
app.use('/treatments', treatmentRoutes);

// Iniciar el servidor en el puerto definido o por defecto en 5000
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
