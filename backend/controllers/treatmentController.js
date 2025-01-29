const db = require('../config/db');

exports.getTreatments = (req, res) => {
  const { nss } = req.user;

  db.query(
    'SELECT id, nombreTratamiento, nombreMedicamento, horaInicio, frecuencia FROM tratamientos WHERE nss = ?',
    [nss],
    (err, results) => {
      if (err) return res.status(500).json({ error: 'Error obteniendo tratamientos' });
      res.json(results);
    }
  );
};
