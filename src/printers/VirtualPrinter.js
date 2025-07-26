const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

class VirtualPrinter {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://api.labelary.com/v1/printers';
    this.dpmm = options.dpmm || '8dpmm'; // 8dpmm (203 DPI), 12dpmm (300 DPI), 24dpmm (600 DPI)
    this.labelWidth = options.labelWidth || '100'; // mm
    this.labelHeight = options.labelHeight || '150'; // mm
    this.labelIndex = options.labelIndex || '0';
    this.outputFormat = options.outputFormat || 'png'; // png, pdf, json
    this.saveDirectory = options.saveDirectory || './generated_labels';
    
    // Ensure save directory exists
    this.ensureDirectoryExists();
  }

  ensureDirectoryExists() {
    if (!fs.existsSync(this.saveDirectory)) {
      fs.mkdirSync(this.saveDirectory, { recursive: true });
      console.log(`Created directory: ${this.saveDirectory}`);
    }
  }

  generateFilename() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = this.outputFormat === 'pdf' ? 'pdf' : 
      this.outputFormat === 'json' ? 'json' : 'png';
    return `label_${timestamp}.${extension}`;
  }

  async print(zplData) {
    const url = `${this.baseUrl}/${this.dpmm}/labels/${this.labelWidth / 25.4}x${this.labelHeight / 25.4}/${this.labelIndex}/`;
    
    return new Promise((resolve, reject) => {
      // Determine protocol
      const protocol = this.baseUrl.startsWith('https') ? https : http;
      
      // Prepare request options
      const postData = zplData;
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
          'Accept': this.getAcceptHeader()
        }
      };

      console.log(`Sending ZPL to Labelary API: ${url}`);
      console.log(`Label size: ${this.labelWidth}x${this.labelHeight} mm at ${this.dpmm}`);
      console.log(`Output format: ${this.outputFormat}`);

      const req = protocol.request(url, options, (res) => {
        let data = Buffer.alloc(0);

        res.on('data', (chunk) => {
          data = Buffer.concat([data, chunk]);
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            const totalCount = res.headers['x-total-count'] || '1';
            console.log(`Labelary API success: Generated ${totalCount} label(s)`);
            
            // Generate filename and save the file
            const filename = this.generateFilename();
            const filepath = path.join(this.saveDirectory, filename);
            
            try {
              // Save the file
              if (this.outputFormat === 'json') {
                fs.writeFileSync(filepath, data.toString(), 'utf8');
              } else {
                fs.writeFileSync(filepath, data);
              }
              
              console.log(`Label saved to: ${filepath}`);
              
              let result = {
                success: true,
                message: 'Label processed and saved successfully',
                labelCount: parseInt(totalCount),
                outputFormat: this.outputFormat,
                dataSize: data.length,
                filename: filename,
                filepath: filepath,
                savedAt: new Date().toISOString()
              };

              resolve(result);
            } catch (saveError) {
              console.error('Error saving file:', saveError);
              reject(new Error(`Failed to save file: ${saveError.message}`));
            }
          } else {
            const errorMessage = data.toString();
            console.error(`Labelary API error (${res.statusCode}):`, errorMessage);
            reject(new Error(`Labelary API error (${res.statusCode}): ${errorMessage}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error('Request error:', error);
        reject(new Error(`Network error: ${error.message}`));
      });

      // Set timeout
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  getAcceptHeader() {
    switch (this.outputFormat.toLowerCase()) {
    case 'pdf':
      return 'application/pdf';
    case 'json':
      return 'application/json';
    case 'png':
    default:
      return 'image/png';
    }
  }

  // Helper method to test ZPL with a simple label
  async testConnection() {
    const testZpl = '^XA^FO50,50^A0N,50,50^FDTest Label^FS^FO50,120^A0N,30,30^FDVirtual Printer^FS^XZ';
    try {
      const result = await this.print(testZpl);
      console.log('Virtual printer test successful:', result);
      return result;
    } catch (error) {
      console.error('Virtual printer test failed:', error);
      throw error;
    }
  }

  // List all saved label files
  listSavedLabels() {
    try {
      if (!fs.existsSync(this.saveDirectory)) {
        return [];
      }

      const files = fs.readdirSync(this.saveDirectory);
      const labelFiles = files
        .filter(file => /\.(png|pdf|json)$/i.test(file))
        .map(file => {
          const filepath = path.join(this.saveDirectory, file);
          const stats = fs.statSync(filepath);
          return {
            filename: file,
            filepath: filepath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            extension: path.extname(file).toLowerCase().substring(1)
          };
        })
        .sort((a, b) => b.created - a.created); // Sort by creation date, newest first

      return labelFiles;
    } catch (error) {
      console.error('Error listing saved labels:', error);
      throw new Error(`Failed to list saved labels: ${error.message}`);
    }
  }

  // Delete a saved label file
  deleteSavedLabel(filename) {
    try {
      const filepath = path.join(this.saveDirectory, filename);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        console.log(`Deleted label file: ${filepath}`);
        return true;
      } else {
        throw new Error('File not found');
      }
    } catch (error) {
      console.error('Error deleting label file:', error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }
}

module.exports = VirtualPrinter;
