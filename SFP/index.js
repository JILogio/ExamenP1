const express = require('express');
const SftpClient = require('ssh2-sftp-client');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const csv = require('csv-parser');
const app = express();
const port = 3002;

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

// Función para descargar el archivo CSV y procesarlo
async function downloadAndProcessCSV() {
  const sftp = new SftpClient();
  const remoteFilePath = '/facturas_proveedores.csv';
  const localFilePath = path.join(__dirname, 'facturas_proveedores.csv');

  try {
    // Conectar al servidor SFTP y descargar el archivo
    await sftp.connect(sftpConfig);
    await sftp.get(remoteFilePath, localFilePath);
    console.log('Archivo CSV descargado con éxito desde el servidor SFTP.');

    // Leer y procesar el archivo CSV
    fs.createReadStream(localFilePath)
      .pipe(csv())
      .on('data', (row) => {
        const { id_proveedor, nombre, contacto, id_factura, monto, estado, fecha_creacion } = row;

        // Validar los datos con la base de datos MySQL
        const proveedorQuery = `SELECT * FROM proveedores WHERE id_proveedor = ?`;
        connection.query(proveedorQuery, [id_proveedor], (err, proveedorResults) => {
          if (err) {
            console.error(`Error al consultar proveedor: ${err.message}`);
            return;
          }

          if (proveedorResults.length === 0) {
            console.warn(`Proveedor con ID ${id_proveedor} no encontrado en la base de datos.`);
            return;
          }

          // Validar los datos del proveedor
          const proveedor = proveedorResults[0];
          if (proveedor.nombre !== nombre || proveedor.contacto !== contacto) {
            console.warn(`Datos del proveedor no coinciden para ID ${id_proveedor}.`);
            return;
          }

          // Validar los datos de la factura
          if (id_factura) {
            const facturaQuery = `SELECT * FROM facturas WHERE id_factura = ?`;
            connection.query(facturaQuery, [id_factura], (err, facturaResults) => {
              if (err) {
                console.error(`Error al consultar factura: ${err.message}`);
                return;
              }

              if (facturaResults.length === 0) {
                // Insertar nueva factura si no existe
                const insertFacturaQuery = `
                  INSERT INTO facturas (id_proveedor, monto, estado, fecha_creacion) 
                  VALUES (?, ?, ?, ?)
                `;
                connection.query(insertFacturaQuery, [id_proveedor, monto, estado, fecha_creacion], (err) => {
                  if (err) {
                    console.error(`Error al insertar factura: ${err.message}`);
                  } else {
                    console.log(`Factura con ID ${id_factura} insertada correctamente.`);
                  }
                });
              } else {
                // Validar los datos de la factura existente
                const factura = facturaResults[0];
                if (factura.monto !== parseFloat(monto) || factura.estado !== estado) {
                  console.warn(`Datos de la factura no coinciden para ID ${id_factura}.`);
                }
              }
            });
          } else {
            console.warn(`ID de factura no proporcionado para el proveedor con ID ${id_proveedor}.`);
          }
        });
      })
      .on('end', () => {
        console.log('Archivo CSV procesado y datos validados con la base de datos.');
        // Eliminar el archivo CSV local después de procesarlo
        fs.unlink(localFilePath, (err) => {
          if (err) console.error(`Error al eliminar archivo CSV local: ${err.message}`);
        });
      });
  } catch (err) {
    console.error(`Error al descargar o procesar el archivo CSV: ${err.message}`);
  } finally {
    sftp.end();
  }
}

// Ruta para iniciar el proceso de descarga y procesamiento del archivo CSV
app.get('/start-process', (req, res) => {
  downloadAndProcessCSV();
  res.send('Proceso de descarga y procesamiento iniciado. Revisa la consola para más detalles.');
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`App 2 (SFP) escuchando en http://localhost:${port}`);
});
