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

exports.addTreatment = (req, res) => {
  const { nss } = req.user;
  const { nombreTratamiento, medicamentos } = req.body;

  db.query(
    'INSERT INTO tratamientos (nss, nombreTratamiento) VALUES (?, ?)',
    [nss, nombreTratamiento],
    (err, results) => {
      if (err) return res.status(500).json({ error: 'Error agregando tratamiento' });
      const treatmentId = results.insertId;

      const medicamentosData = medicamentos.map((med) => [treatmentId, med.nombreMedicamento, med.horaInicio, med.frecuencia]);

      db.query(
        'INSERT INTO medicamentos (treatmentId, nombreMedicamento, horaInicio, frecuencia) VALUES ?',
        [medicamentosData],
        (err) => {
          if (err) return res.status(500).json({ error: 'Error agregando medicamentos' });
          res.status(201).json({ message: 'Tratamiento y medicamentos agregados exitosamente' });
        }
      );
    }
  );
};

exports.deleteTreatment = (req, res) => {
  const { id } = req.params;
  const { nss } = req.user;

  db.query('DELETE FROM tratamientos WHERE id = ? AND nss = ?', [id, nss], (err, results) => {
    if (err) return res.status(500).json({ error: 'Error eliminando tratamiento' });
    if (results.affectedRows === 0) return res.status(404).json({ error: 'Tratamiento no encontrado' });
    res.json({ message: 'Tratamiento eliminado exitosamente' });
  });
};
