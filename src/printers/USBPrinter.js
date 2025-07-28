const usb = require('usb');

class USBPrinter {
  constructor(vendorId = 0x0a5f, productId = null) {
    this.vendorId = vendorId;
    this.productId = productId;
    this.device = null;
    this.endpoint = null;
  }

  findPrinter() {
    const devices = usb.getDeviceList();

    // If specific product ID is provided, look for exact match
    if (this.productId) {
      this.device = usb.findByIds(this.vendorId, this.productId);
      if (this.device) {
        console.log(`Found Zebra printer: ${this.vendorId}:${this.productId}`);
        return true;
      }
    }

    // Otherwise, find first Zebra device
    for (const device of devices) {
      if (device.deviceDescriptor.idVendor === this.vendorId) {
        this.device = device;
        console.log(`Found Zebra printer: ${this.vendorId}:${device.deviceDescriptor.idProduct}`);
        return true;
      }
    }

    return false;
  }

  async initializeDevice() {
    if (!this.device) {
      throw new Error('No USB printer device found');
    }

    this.device.open();

    // Get the first interface
    const interface_ = this.device.interface(0);

    // Detach kernel driver if active (Linux/macOS)
    if (interface_.isKernelDriverActive()) {
      interface_.detachKernelDriver();
    }

    interface_.claim();

    // Find the OUT endpoint
    const endpoints = interface_.endpoints;
    this.endpoint = endpoints.find((ep) => ep.direction === 'out');

    if (!this.endpoint) {
      throw new Error('No OUT endpoint found on USB device');
    }
  }

  async print(data) {
    return new Promise((resolve, reject) => {
      if (!this.findPrinter()) {
        reject(new Error('Zebra printer not found via USB'));
        return;
      }

      try {
        this.initializeDevice();

        // Convert string to buffer if needed
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');

        this.endpoint.transfer(buffer, (error) => {
          if (error) {
            console.error('USB transfer error:', error);
            reject(error);
          } else {
            console.log('USB print job sent successfully');
            resolve('Print job sent successfully via USB');
          }

          // Close the device
          try {
            this.device.close();
          } catch (closeError) {
            console.warn('Error closing USB device:', closeError);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = USBPrinter;
