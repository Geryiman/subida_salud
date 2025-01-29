const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const token = req.header('Authorization'); // Obtener el token desde el encabezado
  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. No se proporcionó un token.' });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET); // Verificar el token
    req.user = verified; // Adjuntar el usuario al objeto de la solicitud
    next(); // Pasar al siguiente middleware o controlador
  } catch (err) {
    res.status(401).json({ error: 'Token inválido o expirado.' });
  }
};

module.exports = authenticateToken;
