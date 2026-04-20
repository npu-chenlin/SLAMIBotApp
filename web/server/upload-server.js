const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

// 创建上传目录（如果不存在）
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置multer存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 保留原始文件名，添加时间戳防止重复
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// 创建multer实例
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 300 * 1024 * 1024 // 限制100MB
  }
});

const app = express();
const PORT = 3001;

// 启用CORS
app.use(cors());

// 添加请求日志
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// 文件上传进度中间件
app.use((req, res, next) => {
  let progress = 0;
  const fileSize = req.headers['content-length'] ? parseInt(req.headers['content-length']) : 0;
  
  req.on('data', (chunk) => {
    progress += chunk.length;
    const percent = Math.round((progress / fileSize) * 100);
    console.log(`Upload progress: ${percent}%`);
  });
  
  next();
});

// 文件上传路由
app.post('/upload', upload.single('file'), (req, res) => {
  console.log(req);
  
  if (!req.file) {
    return res.status(400).json({ 
      success: false,
      message: 'No file uploaded' 
    });
  }

  console.log('File uploaded:', req.file);
  
  res.json({
    success: true,
    message: 'File uploaded successfully',
    file: {
      originalName: req.file.originalname,
      fileName: req.file.filename,
      size: req.file.size,
      path: req.file.path,
      mimetype: req.file.mimetype
    }
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`File upload server running on http://localhost:${PORT}`);
  console.log(`Uploads directory: ${uploadDir}`);
});

// 导出app用于测试
module.exports = app;