const Koa = require('koa');
const serve = require('koa-static');
const path = require('path');

const app = new Koa();
const port = process.env.PORT || 3000;

// Define the path to the static assets directory
const publicPath = path.join(__dirname, 'public');

// Use koa-static middleware to serve files from the 'public' directory
// Defer allows Koa to potentially handle routes first if needed later
app.use(serve(publicPath, { 
        defer: true,
        maxage: 86400000,   // Cache files for 1 day
        hidden: true,       // Serve hidden files
        index: 'index.html' // Serve 'default.html' as the index file
      }));

// Simple logger middleware (optional)
app.use(async (ctx, next) => {
    await next();
    const rt = ctx.response.get('X-Response-Time');
    console.log(`${ctx.method} ${ctx.url} - ${rt}`);
  });


// X-Response-Time middleware (optional)
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  ctx.set('X-Response-Time', `${ms}ms`);
});

/* 

// A simple default response if no static file is found and no other route matches
// This helps confirm the server is running if you go to a non-existent path
app.use(async ctx => {
    // Check if ctx.body is already set (e.g., by koa-static)
    if (!ctx.body) {
        // If navigating directly to '/' and index.html wasn't served (unlikely with koa-static)
        // or if requesting a non-existent file/path.
        if (ctx.path === '/') {
             // Koa-static should handle serving index.html for '/',
             // so this might indicate a config issue if reached.
             ctx.body = 'Hello Koa - trying to serve index.html';
        } else {
            // For other paths not matching static files
            ctx.status = 404;
            ctx.body = 'Not Found';
        }
    }
});

 */
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Serving static files from: ${publicPath}`);
});

// Basic error handling
app.on('error', (err, ctx) => {
    console.error('Server error', err, ctx);
});