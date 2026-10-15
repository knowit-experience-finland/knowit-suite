// helpers/blockImages.js

// 1x1 transparent PNG (base64)
export const PLACEHOLDER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAmMB9s0W05UAAAAASUVORK5CYII=';

// Precompute buffer once
const PLACEHOLDER_BUF = Buffer.from(PLACEHOLDER.split(',')[1], 'base64');

// Match only real image URLs (not scripts)
export const IMAGE_URL_RE = /\.(?:png|jpe?g|gif|webp|svg|avif)(?:\?.*)?$/i;

/**
 * Replace all images with a tiny placeholder.
 * Call in test.beforeEach or as needed.
 */
export const blockImages = async (context) => {
  if (!context) return; // guard

  await context.route(IMAGE_URL_RE, (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: PLACEHOLDER_BUF,
    });
  });
};
