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
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/treatments', treatmentRoutes);

// Servidor en el puerto 5000
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
