exports.savePhoto = (req, res) => {
    const { medicamentoId, urlFoto } = req.body;
  
    db.query(
      'INSERT INTO alarmas (medicamentoId, fotoComprobacion) VALUES (?, ?)',
      [medicamentoId, urlFoto],
      (err) => {
        if (err) return res.status(500).json({ error: 'Error guardando foto' });
        res.status(201).json({ message: 'Foto guardada exitosamente' });
      }
    );
  };
  
  exports.getPhotos = (req, res) => {
    const { nss } = req.user;
  
    db.query(
      'SELECT a.fotoComprobacion, m.nombreMedicamento FROM alarmas a JOIN medicamentos m ON a.medicamentoId = m.id JOIN tratamientos t ON m.treatmentId = t.id WHERE t.nss = ?',
      [nss],
      (err, results) => {
        if (err) return res.status(500).json({ error: 'Error obteniendo fotos' });
        res.json(results);
      }
    );
  };
  
  exports.savePushToken = (req, res) => {
    const { nss } = req.user;
    const { pushToken } = req.body;
  
    db.query(
      'UPDATE usuarios SET pushToken = ? WHERE nss = ?',
      [pushToken, nss],
      (err) => {
        if (err) return res.status(500).json({ error: 'Error guardando push token' });
        res.json({ message: 'Push token guardado exitosamente' });
      }
    );
  };