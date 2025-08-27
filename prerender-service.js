// Simple Prerender.io Alternative
// Deploy this to Vercel, Netlify, or Railway for under $100/month

const express = require('express');
const puppeteer = require('puppeteer');
const NodeCache = require('node-cache');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const app = express();
const cache = new NodeCache({ 
  stdTTL: 3600, // Cache for 1 hour
  checkperiod: 600 // Check for expired keys every 10 minutes
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(limiter);
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', cache_stats: cache.getStats() });
});

// Main prerender endpoint
app.get('/render', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  // Validate URL
  try {
    new URL(url);
  } catch (error) {
    return res.status(400).json({ error: 'Invalid URL provided' });
  }

  const cacheKey = `prerender:${url}`;
  
  // Check cache first
  const cachedHtml = cache.get(cacheKey);
  if (cachedHtml) {
    console.log(`Cache hit for: ${url}`);
    return res.set('Content-Type', 'text/html').send(cachedHtml);
  }

  console.log(`Prerendering: ${url}`);
  
  let browser;
  try {
    // Launch browser
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (compatible; PrerenderBot/1.0)');
    
    // Set viewport
    await page.setViewport({ width: 1200, height: 800 });
    
    // Navigate to the page
    await page.goto(url, { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    // Wait for dynamic content to load
    await page.waitForTimeout(2000);
    
    // Get the rendered HTML
    const html = await page.content();
    
    // Cache the result
    cache.set(cacheKey, html);
    
    console.log(`Successfully prerendered: ${url}`);
    res.set('Content-Type', 'text/html').send(html);
    
  } catch (error) {
    console.error('Prerender error:', error);
    res.status(500).json({ 
      error: 'Failed to prerender page',
      message: error.message 
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Clear cache endpoint (optional)
app.post('/clear-cache', (req, res) => {
  const { url } = req.body;
  
  if (url) {
    const cacheKey = `prerender:${url}`;
    cache.del(cacheKey);
    res.json({ message: `Cache cleared for ${url}` });
  } else {
    cache.flushAll();
    res.json({ message: 'All cache cleared' });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Prerender service running on port ${PORT}`);
  console.log(`Usage: GET /render?url=https://example.com`);
});