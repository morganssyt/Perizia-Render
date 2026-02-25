const path = require('path');
const fs = require('fs');

// Copy react-pdf's bundled pdfjs worker to /public so it can be served statically.
// react-pdf ships its own pdfjs-dist which may differ from the top-level install.
const workerSrc = path.join(
  __dirname,
  'node_modules',
  'react-pdf',
  'node_modules',
  'pdfjs-dist',
  'build',
  'pdf.worker.min.mjs',
);
const workerDst = path.join(__dirname, 'public', 'pdf.worker.min.mjs');

if (fs.existsSync(workerSrc)) {
  fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
  try { fs.copyFileSync(workerSrc, workerDst); } catch (_) {}
}

const EXTERNAL_PACKAGES = [
  'pdf-parse', 'pdfjs-dist', '@napi-rs/canvas', 'openai', '@anthropic-ai/sdk',
  'bullmq', 'ioredis', '@aws-sdk/client-s3', '@aws-sdk/client-textract', '@aws-sdk/s3-request-presigner',
  'bcryptjs', 'pdfkit',
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 14.x: use experimental.serverComponentsExternalPackages
  // (serverExternalPackages is Next.js 15+ only — don't use it here)
  experimental: {
    serverComponentsExternalPackages: EXTERNAL_PACKAGES,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.alias.canvas = false;
      config.resolve.alias.encoding = false;

      // Explicitly externalize pdf-parse so webpack NEVER bundles it.
      // pdf-parse internally does require(`./pdf.js/${version}/build/pdf.js`) — a
      // template-literal require that webpack can't statically resolve, producing a
      // broken bundle.  Marking it as external forces Node.js to require() it at
      // runtime from node_modules, where the relative path works correctly.
      const existingExternals = config.externals;
      config.externals = [
        ...(Array.isArray(existingExternals)
          ? existingExternals
          : existingExternals
            ? [existingExternals]
            : []),
        ({ request }, callback) => {
          if (
            request === 'pdf-parse' ||
            (typeof request === 'string' && request.startsWith('pdf-parse/')) ||
            request === 'pdfjs-dist' ||
            (typeof request === 'string' && request.startsWith('pdfjs-dist/'))
          ) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }

    // pdfjs-dist v5 ships .mjs files that mix ESM exports with Object.defineProperty(exports,...).
    // Webpack treats .mjs as strict ESM by default, which breaks that pattern.
    // Setting type 'javascript/auto' tells webpack to handle them as CommonJS-compatible modules.
    config.module.rules.push({
      test: /\.mjs$/,
      include: /node_modules/,
      type: 'javascript/auto',
      resolve: { fullySpecified: false },
    });

    return config;
  },
};

module.exports = nextConfig;
