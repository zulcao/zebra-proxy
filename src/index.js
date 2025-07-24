require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const PrinterFactory = require('./printers/PrinterFactory');

const app = express();
const PORT = process.env.API_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb' }));
app.use(express.raw({ limit: '10mb' }));

// Printer configuration from environment variables
const printerConfig = {
  type: process.env.PRINTER_TYPE || 'tcp',
  host: process.env.PRINTER_HOST,
  port: parseInt(process.env.PRINTER_PORT) || 9100,
  vendorId: process.env.USB_VENDOR_ID ? parseInt(process.env.USB_VENDOR_ID, 16) : 0x0a5f,
  productId: process.env.USB_PRODUCT_ID ? parseInt(process.env.USB_PRODUCT_ID, 16) : null,
  virtual: {
    dpmm: process.env.VIRTUAL_DPMM || '8dpmm',
    labelWidth: process.env.VIRTUAL_LABEL_WIDTH || '4',
    labelHeight: process.env.VIRTUAL_LABEL_HEIGHT || '6',
    labelIndex: process.env.VIRTUAL_LABEL_INDEX || '0',
    outputFormat: process.env.VIRTUAL_OUTPUT_FORMAT || 'png',
    saveDirectory: process.env.VIRTUAL_SAVE_DIRECTORY || './generated_labels',
    baseUrl: process.env.VIRTUAL_BASE_URL || 'http://api.labelary.com/v1/printers'
  }
};

console.log('Printer configuration:', {
  ...printerConfig,
  // Don't log sensitive details in production
  host: printerConfig.type === 'tcp' ? printerConfig.host : 
    printerConfig.type === 'usb' ? 'USB' : 'Virtual (Labelary API)'
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    printerType: printerConfig.type
  });
});

// Print endpoint
app.post('/print', async (req, res) => {
  try {
    // Get the data to print from request body
    let printData;
    
    if (req.is('application/json')) {
      // If JSON, expect a 'data' field
      printData = req.body.data || JSON.stringify(req.body);
    } else if (req.is('text/*')) {
      // If text, use body directly
      printData = req.body;
    } else {
      // For other types, convert to string
      printData = Buffer.isBuffer(req.body) ? req.body.toString() : String(req.body);
    }

    if (!printData) {
      return res.status(400).json({
        error: 'No print data provided',
        message: 'Please provide data to print in the request body'
      });
    }

    console.log(`Received print request, data length: ${printData.length} bytes`);
    console.log('Print data preview:', printData.substring(0, 200) + (printData.length > 200 ? '...' : ''));

    // Create printer instance
    const printer = PrinterFactory.createPrinter(printerConfig);
    
    // Send to printer
    const result = await printer.print(printData);
    
    res.json({
      success: true,
      message: 'Print job sent successfully',
      printerType: printerConfig.type,
      result: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Print error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      printerType: printerConfig.type,
      timestamp: new Date().toISOString()
    });
  }
});

// Get printer status/info
app.get('/printer/info', (req, res) => {
  res.json({
    type: printerConfig.type,
    ...(printerConfig.type === 'tcp' && {
      host: printerConfig.host,
      port: printerConfig.port
    }),
    ...(printerConfig.type === 'usb' && {
      vendorId: `0x${printerConfig.vendorId.toString(16)}`,
      productId: printerConfig.productId ? `0x${printerConfig.productId.toString(16)}` : 'auto-detect'
    }),
    ...(printerConfig.type === 'virtual' && {
      virtual: {
        dpmm: printerConfig.virtual.dpmm,
        labelSize: `${printerConfig.virtual.labelWidth}x${printerConfig.virtual.labelHeight} inches`,
        outputFormat: printerConfig.virtual.outputFormat,
        returnResponse: printerConfig.virtual.returnResponse,
        apiEndpoint: `${printerConfig.virtual.baseUrl}/${printerConfig.virtual.dpmm}/labels/${printerConfig.virtual.labelWidth}x${printerConfig.virtual.labelHeight}/${printerConfig.virtual.labelIndex}/`
      }
    })
  });
});

// Test virtual printer connection (only available for virtual printers)
app.get('/printer/test', async (req, res) => {
  if (printerConfig.type !== 'virtual') {
    return res.status(400).json({
      error: 'Test endpoint only available for virtual printers',
      currentType: printerConfig.type
    });
  }

  try {
    const printer = PrinterFactory.createPrinter(printerConfig);
    const result = await printer.testConnection();
    
    res.json({
      success: true,
      message: 'Virtual printer test successful',
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Virtual printer test error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// List saved labels (only for virtual printers)
app.get('/labels', (req, res) => {
  if (printerConfig.type !== 'virtual') {
    return res.status(400).json({
      error: 'Labels endpoint only available for virtual printers',
      currentType: printerConfig.type
    });
  }

  try {
    const printer = PrinterFactory.createPrinter(printerConfig);
    const labels = printer.listSavedLabels();
    
    res.json({
      success: true,
      labels: labels,
      count: labels.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error listing labels:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Serve saved label files (only for virtual printers)
app.get('/labels/:filename', (req, res) => {
  if (printerConfig.type !== 'virtual') {
    return res.status(400).json({
      error: 'Labels endpoint only available for virtual printers',
      currentType: printerConfig.type
    });
  }

  try {
    const { filename } = req.params;
    const saveDirectory = printerConfig.virtual.saveDirectory;
    const filepath = path.join(saveDirectory, filename);
    
    // Security check: ensure file is within save directory
    const resolvedPath = path.resolve(filepath);
    const resolvedSaveDir = path.resolve(saveDirectory);
    
    if (!resolvedPath.startsWith(resolvedSaveDir)) {
      return res.status(403).json({
        error: 'Access denied: Invalid file path'
      });
    }

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        error: 'File not found'
      });
    }

    // Set appropriate content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    
    switch (ext) {
    case '.png':
      contentType = 'image/png';
      break;
    case '.pdf':
      contentType = 'application/pdf';
      break;
    case '.json':
      contentType = 'application/json';
      break;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    
    const fileStream = fs.createReadStream(filepath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Error serving label file:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Delete a saved label (only for virtual printers)
app.delete('/labels/:filename', (req, res) => {
  if (printerConfig.type !== 'virtual') {
    return res.status(400).json({
      error: 'Labels endpoint only available for virtual printers',
      currentType: printerConfig.type
    });
  }

  try {
    const { filename } = req.params;
    const printer = PrinterFactory.createPrinter(printerConfig);
    printer.deleteSavedLabel(filename);
    
    res.json({
      success: true,
      message: `Label ${filename} deleted successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error deleting label:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Web interface to view labels
app.get('/viewer', (req, res) => {
  if (printerConfig.type !== 'virtual') {
    return res.status(400).send(`
      <html>
        <head><title>Label Viewer</title></head>
        <body>
          <h1>Label Viewer</h1>
          <p>Label viewer is only available when using virtual printer mode.</p>
          <p>Current printer type: <strong>${printerConfig.type}</strong></p>
          <p>Set <code>PRINTER_TYPE=virtual</code> in your .env file to use this feature.</p>
        </body>
      </html>
    `);
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Zebra Proxy - Label Viewer</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 20px;
                background-color: #f5f5f5;
            }
            .container {
                max-width: 1200px;
                margin: 0 auto;
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            h1 {
                color: #333;
                text-align: center;
                margin-bottom: 30px;
            }
            .controls {
                margin-bottom: 20px;
                text-align: center;
            }
            .refresh-btn {
                background: #007bff;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 16px;
            }
            .refresh-btn:hover {
                background: #0056b3;
            }
            .labels-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: 20px;
                margin-top: 20px;
            }
            .label-card {
                border: 1px solid #ddd;
                border-radius: 8px;
                padding: 15px;
                background: white;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .label-card img {
                max-width: 100%;
                height: auto;
                border: 1px solid #eee;
                border-radius: 4px;
                cursor: pointer;
            }
            .label-info {
                margin-top: 10px;
                font-size: 14px;
                color: #666;
            }
            .label-filename {
                font-weight: bold;
                color: #333;
                margin-bottom: 5px;
            }
            .delete-btn {
                background: #dc3545;
                color: white;
                border: none;
                padding: 5px 10px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                margin-top: 10px;
            }
            .delete-btn:hover {
                background: #c82333;
            }
            .no-labels {
                text-align: center;
                color: #666;
                font-style: italic;
                grid-column: 1 / -1;
            }
            .error {
                color: #dc3545;
                text-align: center;
                padding: 20px;
            }
            .loading {
                text-align: center;
                color: #666;
                padding: 20px;
            }
            .modal {
                display: none;
                position: fixed;
                z-index: 1000;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0,0,0,0.8);
                cursor: pointer;
            }
            .modal-content {
                margin: auto;
                display: block;
                max-width: 90%;
                max-height: 90%;
                margin-top: 5%;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🏷️ Zebra Proxy Label Viewer</h1>
            <div class="controls">
                <button class="refresh-btn" onclick="loadLabels()">🔄 Refresh Labels</button>
            </div>
            <div id="content">
                <div class="loading">Loading labels...</div>
            </div>
        </div>

        <!-- Modal for enlarged image view -->
        <div id="imageModal" class="modal" onclick="closeModal()">
            <img class="modal-content" id="modalImage">
        </div>

        <script>
            async function loadLabels() {
                const content = document.getElementById('content');
                content.innerHTML = '<div class="loading">Loading labels...</div>';
                
                try {
                    const response = await fetch('/labels');
                    const data = await response.json();
                    
                    if (data.success) {
                        displayLabels(data.labels);
                    } else {
                        content.innerHTML = \`<div class="error">Error: \${data.error}</div>\`;
                    }
                } catch (error) {
                    content.innerHTML = \`<div class="error">Failed to load labels: \${error.message}</div>\`;
                }
            }

            function displayLabels(labels) {
                const content = document.getElementById('content');
                
                if (labels.length === 0) {
                    content.innerHTML = '<div class="labels-grid"><div class="no-labels">No labels found. Generate some labels first!</div></div>';
                    return;
                }

                const grid = document.createElement('div');
                grid.className = 'labels-grid';

                labels.forEach(label => {
                    const card = document.createElement('div');
                    card.className = 'label-card';

                    const isImage = label.extension === 'png';
                    const isPdf = label.extension === 'pdf';
                    
                    card.innerHTML = \`
                        <div class="label-filename">\${label.filename}</div>
                        \${isImage ? \`<img src="/labels/\${label.filename}" alt="\${label.filename}" onclick="openModal('/labels/\${label.filename}')">\` : ''}
                        \${isPdf ? \`<div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 4px;"><a href="/labels/\${label.filename}" target="_blank">📄 View PDF</a></div>\` : ''}
                        \${label.extension === 'json' ? \`<div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 4px;"><a href="/labels/\${label.filename}" target="_blank">📋 View JSON</a></div>\` : ''}
                        <div class="label-info">
                            <div>Size: \${(label.size / 1024).toFixed(1)} KB</div>
                            <div>Created: \${new Date(label.created).toLocaleString()}</div>
                            <div>Type: \${label.extension.toUpperCase()}</div>
                        </div>
                        <button class="delete-btn" onclick="deleteLabel('\${label.filename}')">🗑️ Delete</button>
                    \`;
                    
                    grid.appendChild(card);
                });

                content.innerHTML = '';
                content.appendChild(grid);
            }

            async function deleteLabel(filename) {
                if (!confirm(\`Are you sure you want to delete \${filename}?\`)) {
                    return;
                }

                try {
                    const response = await fetch(\`/labels/\${filename}\`, { method: 'DELETE' });
                    const data = await response.json();
                    
                    if (data.success) {
                        loadLabels(); // Refresh the list
                    } else {
                        alert(\`Error deleting file: \${data.error}\`);
                    }
                } catch (error) {
                    alert(\`Failed to delete file: \${error.message}\`);
                }
            }

            function openModal(src) {
                const modal = document.getElementById('imageModal');
                const modalImg = document.getElementById('modalImage');
                modal.style.display = 'block';
                modalImg.src = src;
            }

            function closeModal() {
                document.getElementById('imageModal').style.display = 'none';
            }

            // Load labels on page load
            loadLabels();
        </script>
    </body>
    </html>
  `);
});

// Error handling middleware
app.use((error, req, res) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.all('/*splat', (req, res) => {
  const endpoints = [
    'GET /health',
    'POST /print',
    'GET /printer/info'
  ];
  
  if (printerConfig.type === 'virtual') {
    endpoints.push(
      'GET /printer/test (virtual only)',
      'GET /labels (virtual only)',
      'GET /labels/:filename (virtual only)',
      'DELETE /labels/:filename (virtual only)',
      'GET /viewer (virtual only)'
    );
  }

  res.status(404).json({
    error: `Endpoint ${req.originalUrl} not found`,
    availableEndpoints: endpoints
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Zebra Proxy API running on port ${PORT}`);
  console.log(`Printer type: ${printerConfig.type}`);
  console.log('Available endpoints:');
  console.log(`  GET  http://localhost:${PORT}/health`);
  console.log(`  POST http://localhost:${PORT}/print`);
  console.log(`  GET  http://localhost:${PORT}/printer/info`);
  if (printerConfig.type === 'virtual') {
    console.log(`  GET  http://localhost:${PORT}/printer/test`);
    console.log(`  GET  http://localhost:${PORT}/labels`);
    console.log(`  GET  http://localhost:${PORT}/labels/:filename`);
    console.log(`  DELETE http://localhost:${PORT}/labels/:filename`);
    console.log(`  GET  http://localhost:${PORT}/viewer`);
    console.log('');
    console.log(`📁 Labels will be saved to: ${printerConfig.virtual.saveDirectory}`);
    console.log(`🌐 View labels in browser: http://localhost:${PORT}/viewer`);
  }
});

module.exports = app;
