// app1.js
const express = require('express');
const SftpClient = require('ssh2-sftp-client');
const fs = require('fs');
const path = require('path');
const csvWriter = require('csv-writer').createObjectCsvWriter;
const mysql = require('mysql2');
const app = express();
const port = 3001;

const sftpConfig = {
  host: '127.0.0.1',
  port: 22,
  username: 'tester',
  password: 'password'
};

// Configuración de la base de datos MySQL
const dbConfig = {
  host: 'localhost',
  user: 'test',
  password: '123456',
  database: 'sistema_facturacion'
};

// Crear conexión a la base de datos
const connection = mysql.createConnection(dbConfig);

// Conectar a la base de datos
connection.connect((err) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err.message);
    process.exit();
  }
  console.log('Conectado a la base de datos MySQL.');
});

// Configurar el archivo CSV
const csvPath = path.join(__dirname, 'facturas_proveedores.csv');
const csvWriterInstance = csvWriter({
  path: csvPath,
  header: [
    { id: 'id_proveedor', title: 'ID Proveedor' },
    { id: 'nombre', title: 'Nombre' },
    { id: 'contacto', title: 'Contacto' },
    { id: 'id_factura', title: 'ID Factura' },
    { id: 'monto', title: 'Monto' },
    { id: 'estado', title: 'Estado' },
    { id: 'fecha_creacion', title: 'Fecha de Creación' }
  ]
});

// Ruta para generar un archivo CSV con la información de los proveedores y facturas, y subirlo al servidor SFTP
app.post('/generate-and-upload', (req, res) => {
  const query = `
    SELECT p.id_proveedor, p.nombre, p.contacto, f.id_factura, f.monto, f.estado, f.fecha_creacion 
    FROM proveedores p
    LEFT JOIN facturas f ON p.id_proveedor = f.id_proveedor
  `;

  connection.query(query, async (err, results) => {
    if (err) {
      console.error('Error al obtener datos de la base de datos:', err.message);
      res.status(500).send('Error al obtener datos de la base de datos');
      return;
    }

    try {
      // Escribir los datos al archivo CSV
      await csvWriterInstance.writeRecords(results);
      console.log('Archivo CSV generado con éxito.');

      // Conectar al servidor SFTP y subir el archivo
      const sftp = new SftpClient();
      await sftp.connect(sftpConfig);
      const remoteFilePath = '/facturas_proveedores.csv';
      await sftp.put(csvPath, remoteFilePath);
      console.log('Archivo CSV subido con éxito al servidor SFTP.');

      res.send('Archivo CSV generado y subido con éxito al servidor SFTP');
    } catch (err) {
      console.error(`Error al generar o subir el archivo CSV: ${err.message}`);
      res.status(500).send('Error al generar o subir el archivo CSV');
    } finally {
      // Eliminar el archivo CSV local después de subirlo
      fs.unlink(csvPath, (err) => {
        if (err) console.error(`Error al eliminar archivo CSV local: ${err.message}`);
      });
    }
  });
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`App 1 escuchando en http://localhost:${port}`);
});
