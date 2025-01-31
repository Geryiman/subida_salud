const authenticateToken = (req, res, next) => {
  // Simplemente pasa al siguiente middleware o controlador
  next();
};

module.exports = authenticateToken;