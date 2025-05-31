require('dotenv').config();
const express = require('express');
const cors = require('cors'); // FIXED: Add cors import
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');  // Add Morgan for request logging

const PORT = process.env.PORT || 4000;
const app = express();


// Configure Morgan for request logging
app.use(morgan(':date[iso] - :remote-addr - ":method :url" - Status :status - :response-time ms'));
// Add simple route logging middleware
app.use((req, res, next) => {
  // Log only the first visit to specific routes
  if (!req.url.endsWith('favicon.ico') && !req.headers['x-logged']) {
    const timestamp = new Date().toISOString();
    const userAgent = req.get('user-agent') || 'Unknown';
    const lang = req.get('accept-language') || 'Unknown';
    const clientIp = req.headers['x-forwarded-for'] || req.ip;
    
    console.log(`\n[${timestamp}] ${clientIp} requested ${req.method} ${req.url}`);
    console.log(`  -> User Agent: ${userAgent}`);
    console.log(`  -> Language: ${lang}`);
    console.log(`  -> Referer: ${req.get('referer') || 'Direct'}`);
    
    // Flag to prevent duplicate logging
    req.headers['x-logged'] = 'true';
  }
  next();
});

app.use(cors());
app.use(express.json());

// Global security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next(); // MUST call next()
});

// Rate limiter
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Increased limit for streaming
  standardHeaders: true,
});

app.use('/ollama', limiter);

// Proxy configuration
const ollamaProxy = createProxyMiddleware({
  target: process.env.OLLAMA_URL || "http://localhost:11434",
  changeOrigin: true,
  pathRewrite: {'^/ollama': ''},
  on: {
    proxyReq: (proxyReq) => {
      // Header cleanup
      const unsafeHeaders = [
        'authentication', 'origin', 'referer', 
        'cookie', 'x-forwarded-for', 'via'
      ];
      unsafeHeaders.forEach(header => {
        proxyReq.removeHeader(header);
      });
      proxyReq.setHeader('x-proxy-agent', 'ollama-proxy/1.0');
    },
    proxyRes: (proxyRes) => {
      // Header cleanup
      const sensitiveHeaders = [
        'server', 'x-powered-by',
        'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'
      ];
      sensitiveHeaders.forEach(header => {
        proxyRes.headers[header] && delete proxyRes.headers[header];
      });
      
    }
  }
});

// Proxy mount
app.use('/ollama', ollamaProxy);

// Routes
app.get('/', (req, res) => {
  res.send("Ollama Proxy Running");
});

// Error handling
app.use((req, res) => res.status(404).json({error: "Not Found"}));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something went wrong");
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Ollama Proxy Live at: http://0.0.0.0:${PORT}`);
  console.log(`Accessible on all network interfaces`);
  console.log(`Ollama: ${process.env.OLLAMA_URL || 'http://localhost:11434'}`);
});

