# Zebra Proxy API

A simple REST API that acts as a proxy to send print data to Zebra printers via TCP (network) or USB connections.

## Features

- **TCP/Network printing**: Send data to Zebra printers over the network
- **USB printing**: Send data to locally connected USB Zebra printers
- **Virtual printing**: Test and preview labels using the Labelary Label API with local file saving
- **Label viewer**: Web interface to view, manage, and delete saved labels (virtual mode only)
- **Environment-based configuration**: Configure printer settings via environment variables
- **Multiple data formats**: Accepts JSON, text, and raw data
- **Health check endpoint**: Monitor API status
- **Error handling**: Comprehensive error reporting

## Quick Start

1. **Configure your printer** in the `.env` file
2. **Start the API**: The task "Start Zebra Proxy API" is now available in VS Code, or run:
   ```bash
   npm start
   ```
3. **Send a test print**:
   ```bash
   curl -X POST http://localhost:3000/print \
     -H "Content-Type: text/plain" \
     -d "^XA^FO50,50^A0N,50,50^FDHello World^FS^XZ"
   ```
4. **View saved labels** (virtual mode only):
   - Open http://localhost:3000/viewer in your browser

## Docker Deployment

### 🐳 Quick Start with Docker

#### Using Docker Compose (Recommended)
```bash
# Start the application
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the application
docker-compose down
```

#### Using Docker directly
```bash
# Build the image
docker build -t zebra-proxy .
or
docker build --target production -t zebra-proxy:prod .
or
docker build --target dev -t zebra-proxy:dev .

# Run the container
docker run -p 3000:3000 \
  -e PRINTER_TYPE=virtual \
  -e VIRTUAL_OUTPUT_FORMAT=png \
  zebra-proxy
```

### ⚙️ Environment Configuration

#### Docker Compose Environment Variables
Edit `docker-compose.yml` or create a `.env` file:
```env
PRINTER_TYPE=virtual
VIRTUAL_DPMM=8dpmm
VIRTUAL_LABEL_WIDTH=4
VIRTUAL_LABEL_HEIGHT=6
VIRTUAL_OUTPUT_FORMAT=png
API_PORT=3000
```

#### Volume Persistence
Generated labels are stored in a Docker volume (`labels_data`) to persist between container restarts.

### 🔧 Advanced Docker Configurations

#### For USB Printer Access
Uncomment these lines in `docker-compose.yml`:
```yaml
privileged: true
devices:
  - /dev/bus/usb:/dev/bus/usb
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Copy the environment configuration:
```bash
cp .env.example .env
```

3. Edit `.env` file with your printer settings:
```env
# For TCP/Network printer:
PRINTER_TYPE=tcp
PRINTER_HOST=192.168.1.100
PRINTER_PORT=9100

# For USB printer:
PRINTER_TYPE=usb
USB_VENDOR_ID=0x0a5f  # Zebra vendor ID
USB_PRODUCT_ID=0x0001  # Optional: specific product ID

# For Virtual printer (Labelary API):
PRINTER_TYPE=virtual
VIRTUAL_DPMM=8dpmm
VIRTUAL_LABEL_WIDTH=4
VIRTUAL_LABEL_HEIGHT=6
VIRTUAL_OUTPUT_FORMAT=png

# API settings:
API_PORT=3000
```

## Usage

### Start the server

Development mode (with auto-restart):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

### API Endpoints

#### Health Check
```bash
GET /health
```
Returns the API status and configuration.

#### Send Print Job
```bash
POST /print
```

Send data to the printer. Accepts various content types:

**JSON data:**
```bash
curl -X POST http://localhost:3000/print \
  -H "Content-Type: application/json" \
  -d '{"data": "^XA^FO50,50^A0N,50,50^FDHello World^FS^XZ"}'
```

**Plain text (ZPL commands):**
```bash
curl -X POST http://localhost:3000/print \
  -H "Content-Type: text/plain" \
  -d "^XA^FO50,50^A0N,50,50^FDHello World^FS^XZ"
```

**Raw data:**
```bash
curl -X POST http://localhost:3000/print \
  --data-raw "^XA^FO50,50^A0N,50,50^FDHello World^FS^XZ"
```

#### Get Printer Info
```bash
GET /printer/info
```
Returns current printer configuration details.

#### Test Virtual Printer
```bash
GET /printer/test
```
Tests the virtual printer connection (only available when `PRINTER_TYPE=virtual`). Sends a sample ZPL to the Labelary API.

#### List Saved Labels
```bash
GET /labels
```
Returns a list of all saved label files (only available when `PRINTER_TYPE=virtual`).

#### View/Download Label File
```bash
GET /labels/:filename
```
Serves a specific label file for viewing or download (only available when `PRINTER_TYPE=virtual`).

#### Delete Label File
```bash
DELETE /labels/:filename
```
Deletes a specific saved label file (only available when `PRINTER_TYPE=virtual`).

#### Label Viewer Web Interface
```bash
GET /viewer
```
Opens a web interface to view, manage, and delete saved labels (only available when `PRINTER_TYPE=virtual`). Perfect for testing and previewing labels in a browser.

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PRINTER_TYPE` | Printer connection type (`tcp`, `usb`, or `virtual`) | `tcp` | Yes |
| `PRINTER_HOST` | IP address for TCP connection | - | Yes (for TCP) |
| `PRINTER_PORT` | Port for TCP connection | `9100` | No |
| `USB_VENDOR_ID` | USB vendor ID (hex format) | `0x0a5f` | No |
| `USB_PRODUCT_ID` | USB product ID (hex format) | auto-detect | No |
| `VIRTUAL_DPMM` | Print density for virtual printer | `8dpmm` | No |
| `VIRTUAL_LABEL_WIDTH` | Label width in inches | `4` | No |
| `VIRTUAL_LABEL_HEIGHT` | Label height in inches | `6` | No |
| `VIRTUAL_OUTPUT_FORMAT` | Output format (`png`, `pdf`, `json`) | `png` | No |
| `VIRTUAL_SAVE_DIRECTORY` | Directory to save generated labels | `./generated_labels` | No |
| `API_PORT` | API server port | `3000` | No |

### TCP/Network Configuration

For network-connected Zebra printers:
```env
PRINTER_TYPE=tcp
PRINTER_HOST=192.168.1.100
PRINTER_PORT=9100
```

### USB Configuration

For USB-connected Zebra printers:
```env
PRINTER_TYPE=usb
USB_VENDOR_ID=0x0a5f
# USB_PRODUCT_ID=0x0001  # Optional: leave commented for auto-detection
```

### Virtual Configuration

For virtual printing using the Labelary API (great for testing):
```env
PRINTER_TYPE=virtual
VIRTUAL_DPMM=8dpmm  # 6dpmm, 8dpmm, 12dpmm, 24dpmm
VIRTUAL_LABEL_WIDTH=4  # inches
VIRTUAL_LABEL_HEIGHT=6  # inches
VIRTUAL_OUTPUT_FORMAT=png  # png, pdf, json
VIRTUAL_SAVE_DIRECTORY=./generated_labels  # Where to save labels
```

## ZPL Example

Zebra Programming Language (ZPL) is commonly used with Zebra printers. Here's a simple label example:

```zpl
^XA
^FO50,50^A0N,50,50^FDHello World^FS
^FO50,120^A0N,30,30^FDZebra Proxy API^FS
^XZ
```

This creates a label with "Hello World" and "Zebra Proxy API" text.

## Troubleshooting

### TCP Connection Issues
- Verify the printer IP address and port (usually 9100)
- Check network connectivity: `ping <printer_ip>`
- Ensure the printer's network settings allow connections

### USB Connection Issues
- Check if the printer is properly connected and powered on
- Verify USB vendor/product IDs using `lsusb` (Linux) or System Information (macOS)
- On Linux, you might need to run with sudo or configure udev rules
- On macOS, you might need to install additional drivers

### Virtual Printer Issues
- Check internet connectivity for Labelary API access
- Verify ZPL syntax is correct
- Note: Free Labelary API has rate limits (3 requests/second, 5,000/day)
- For high-volume usage, consider Labelary premium plans

### Permission Issues (USB on Linux/macOS)
You may need to add your user to the appropriate group or run with elevated permissions for USB access.

## API Response Examples

### Successful Print Job
```json
{
  "success": true,
  "message": "Print job sent successfully",
  "printerType": "tcp",
  "result": "Print job sent successfully",
  "timestamp": "2025-07-24T10:30:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Connection refused",
  "printerType": "tcp",
  "timestamp": "2025-07-24T10:30:00.000Z"
}
```

## License

MIT
