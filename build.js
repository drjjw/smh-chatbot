const fs = require('fs');
const path = require('path');

console.log('🔨 Building distribution files...\n');

const distDir = path.join(__dirname, 'dist');

// Create dist directory if it doesn't exist
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
    console.log('✓ Created dist/ directory');
}

// Create dist/public directory if it doesn't exist
const publicDistDir = path.join(distDir, 'public');
if (!fs.existsSync(publicDistDir)) {
    fs.mkdirSync(publicDistDir, { recursive: true });
    console.log('✓ Created dist/public/ directory');
}

// Files to copy (production essentials only)
const filesToCopy = [
    { from: 'server.js', to: 'server.js' },
    { from: 'package.json', to: 'package.json' },
    { from: 'package-lock.json', to: 'package-lock.json' },
    { from: 'public/index.html', to: 'public/index.html' },
    { from: 'smh-manual-2023.pdf', to: 'smh-manual-2023.pdf' },
    { from: 'uhn-manual-2025.pdf', to: 'uhn-manual-2025.pdf' },
    { from: 'embed-smh-manual.html', to: 'embed-smh-manual.html' },
    { from: 'embed-uhn-manual.html', to: 'embed-uhn-manual.html' },
    { from: '.htaccess', to: '.htaccess', optional: true }
];

let copiedCount = 0;
let skippedCount = 0;

filesToCopy.forEach(file => {
    const sourcePath = path.join(__dirname, file.from);
    const destPath = path.join(distDir, file.to);
    
    if (fs.existsSync(sourcePath)) {
        // Ensure destination directory exists
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        
        fs.copyFileSync(sourcePath, destPath);
        console.log(`✓ Copied ${file.from}`);
        copiedCount++;
    } else if (!file.optional) {
        console.log(`✗ Missing required file: ${file.from}`);
        process.exit(1);
    } else {
        console.log(`⊘ Skipped optional file: ${file.from}`);
        skippedCount++;
    }
});

console.log(`\n📦 Build complete!`);
console.log(`   - ${copiedCount} files copied`);
if (skippedCount > 0) {
    console.log(`   - ${skippedCount} optional files skipped`);
}
console.log(`   - Output: dist/\n`);
console.log('💡 Note: .env file must be manually copied to server (not included in build)');
console.log('💡 Run "npm install --production" in dist/ on the server\n');

