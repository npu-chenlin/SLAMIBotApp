# File Upload Server

A Node.js server for handling file uploads via HTTP POST requests.

## Features

- Single file upload support
- Progress tracking
- File size limits (100MB)
- Cross-origin support (CORS)
- Error handling
- Logging

## Installation

1. Make sure you have Node.js (>=14.0.0) installed
2. Navigate to the server directory:
   ```bash
   cd server
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

## Running the Server

### Production mode:
```bash
npm start
```

### Development mode (with auto-restart):
```bash
npm run dev
```

## API Endpoints

### POST /upload
Upload a single file.

**Request:**
- Content-Type: multipart/form-data
- Form field name: `file`

**Response:**
```json
{
  "success": true,
  "message": "File uploaded successfully",
  "file": {
    "originalName": "example.txt",
    "fileName": "file-123456789.txt",
    "size": 1024,
    "path": "/path/to/uploads/file-123456789.txt",
    "mimetype": "text/plain"
  }
}
```

## Configuration

You can modify these settings in `upload-server.js`:

- **Upload directory**: Change `uploadDir` variable
- **File size limit**: Modify `limits.fileSize` in multer config
- **Port**: Change `PORT` constant

## Testing

You can test the server using curl:

```bash
curl -X POST -F "file=@/path/to/your/file.txt" http://localhost:3001/upload
```

Or using Postman/Insomnia by:
1. Setting method to POST
2. Setting URL to `http://localhost:3001/upload`
3. Adding a form-data field named "file"
4. Selecting your file
```