const https = require('node:https');

// Public pages only; the caller validates the host and every redirect.
// Explicit IPv4 avoids the connection stalls seen with fetch on NAVER blogs.
function readPublicPage(url, signal) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { family: 4, signal }, response => {
      const page = { status: response.statusCode, location: response.headers.location || '',
        contentType: response.headers['content-type'] || '', html: '' };
      response.on('error', reject);
      if (page.status !== 200 || !/text\/html/i.test(page.contentType)) {
        response.destroy();
        resolve(page);
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 1500000) {
          response.destroy();
          resolve({ ...page, oversized: true });
        } else chunks.push(chunk);
      });
      response.on('end', () => resolve({ ...page, html: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject);
  });
}

module.exports = { readPublicPage };
