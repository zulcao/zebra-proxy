const net = require('net');

class TCPPrinter {
  constructor(host, port) {
    this.host = host;
    this.port = port;
  }

  async print(data) {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();

      client.connect(this.port, this.host, () => {
        console.log(`Connected to printer at ${this.host}:${this.port}`);
        client.write(data);
      });

      client.on('data', (response) => {
        console.log('Printer response:', response.toString());
        client.destroy();
        resolve(response);
      });

      client.on('close', () => {
        console.log('Connection closed');
        resolve('Print job sent successfully');
      });

      client.on('error', (err) => {
        console.error('TCP connection error:', err);
        reject(err);
      });

      // Set a timeout to close connection if no response
      setTimeout(() => {
        if (!client.destroyed) {
          client.destroy();
          resolve('Print job sent (timeout)');
        }
      }, 5000);
    });
  }
}

module.exports = TCPPrinter;
