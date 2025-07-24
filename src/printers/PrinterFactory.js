const TCPPrinter = require('./TCPPrinter');
const USBPrinter = require('./USBPrinter');
const VirtualPrinter = require('./VirtualPrinter');

class PrinterFactory {
  static createPrinter(config) {
    const { type, host, port, vendorId, productId, virtual } = config;
    
    switch (type.toLowerCase()) {
    case 'tcp':
      if (!host || !port) {
        throw new Error('TCP printer requires host and port configuration');
      }
      return new TCPPrinter(host, port);
        
    case 'usb':
      return new USBPrinter(vendorId, productId);
        
    case 'virtual':
      return new VirtualPrinter(virtual);
        
    default:
      throw new Error(`Unsupported printer type: ${type}. Supported types: tcp, usb, virtual`);
    }
  }
}

module.exports = PrinterFactory;
