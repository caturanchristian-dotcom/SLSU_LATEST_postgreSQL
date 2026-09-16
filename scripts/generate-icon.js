import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

async function generateIcons() {
  const publicDir = path.resolve(process.cwd(), 'public');
  const sourcePath = fs.existsSync(path.join(publicDir, 'slsu-logo.png'))
    ? path.join(publicDir, 'slsu-logo.png')
    : path.join(publicDir, 'icon.svg');
  const sourceBuffer = fs.readFileSync(sourcePath);

  console.log(`Generating PWA icons from ${path.basename(sourcePath)}...`);

  // 1. 192x192 standard icon
  await sharp(sourceBuffer)
    .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ quality: 95 })
    .toFile(path.join(publicDir, 'pwa-192x192.png'));
  console.log('✓ Created pwa-192x192.png');

  // 2. 512x512 standard icon
  await sharp(sourceBuffer)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ quality: 95 })
    .toFile(path.join(publicDir, 'pwa-512x512.png'));
  console.log('✓ Created pwa-512x512.png');

  // 3. 180x180 Apple Touch Icon (iOS Safari requires solid background)
  const appleInner = await sharp(sourceBuffer)
    .resize(150, 150, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: {
      width: 180,
      height: 180,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite([{ input: appleInner, top: 15, left: 15 }])
    .png({ quality: 95 })
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('✓ Created apple-touch-icon.png');

  // 4. Favicon PNG 64x64
  await sharp(sourceBuffer)
    .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ quality: 95 })
    .toFile(path.join(publicDir, 'favicon.png'));
  console.log('✓ Created favicon.png');

  // 5. Maskable 512x512 icon (with 18% safe zone margin on white backing for Android adaptive icons)
  const maskableInnerSize = 410;
  const maskableInner = await sharp(sourceBuffer)
    .resize(maskableInnerSize, maskableInnerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite([
      {
        input: maskableInner,
        top: Math.round((512 - maskableInnerSize) / 2),
        left: Math.round((512 - maskableInnerSize) / 2),
      },
    ])
    .png({ quality: 95 })
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));
  console.log('✓ Created pwa-maskable-512x512.png');

  console.log('All icons generated successfully!');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
