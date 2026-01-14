/**
 * Zotero AI Assistant - Build Script
 * 
 * Creates an XPI package for distribution
 * Usage: node scripts/build.js [--dev] [--watch]
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const ROOT_DIR = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT_DIR, 'build');
const MANIFEST_PATH = path.join(ROOT_DIR, 'manifest.json');

// Files and directories to include in the XPI
const INCLUDE_FILES = [
  'manifest.json',
  'chrome.manifest',
  'bootstrap.js',
  'prefs.js',
  'chrome/'
];

// Files to exclude
const EXCLUDE_PATTERNS = [
  /\.DS_Store$/,
  /Thumbs\.db$/,
  /\.git/,
  /node_modules/,
  /\.map$/
];

/**
 * Read manifest to get version and plugin info
 */
function getManifest() {
  const content = fs.readFileSync(MANIFEST_PATH, 'utf8');
  return JSON.parse(content);
}

/**
 * Check if a path should be excluded
 */
function shouldExclude(filePath) {
  return EXCLUDE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Ensure build directory exists
 */
function ensureBuildDir() {
  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
  }
}

/**
 * Build the XPI package
 */
async function buildXPI(isDev = false) {
  const manifest = getManifest();
  const version = manifest.version;
  const suffix = isDev ? '-dev' : '';
  const outputName = `zotero-ai-assistant-${version}${suffix}.xpi`;
  const outputPath = path.join(BUILD_DIR, outputName);
  
  console.log(`Building ${outputName}...`);
  
  ensureBuildDir();
  
  // Remove existing file if present
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }
  
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });
    
    output.on('close', () => {
      const sizeKB = (archive.pointer() / 1024).toFixed(2);
      console.log(`Created ${outputName} (${sizeKB} KB)`);
      resolve(outputPath);
    });
    
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        console.warn('Warning:', err.message);
      } else {
        reject(err);
      }
    });
    
    archive.on('error', (err) => {
      reject(err);
    });
    
    archive.pipe(output);
    
    // Add files to archive
    for (const item of INCLUDE_FILES) {
      const itemPath = path.join(ROOT_DIR, item);
      
      if (!fs.existsSync(itemPath)) {
        console.warn(`Warning: ${item} not found, skipping`);
        continue;
      }
      
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        archive.directory(itemPath, item, (entry) => {
          return shouldExclude(entry.name) ? false : entry;
        });
      } else {
        if (!shouldExclude(item)) {
          archive.file(itemPath, { name: item });
        }
      }
    }
    
    archive.finalize();
  });
}

/**
 * Watch for file changes and rebuild
 */
async function watchMode() {
  const chokidar = require('chokidar');
  
  console.log('Watching for changes...');
  
  const watcher = chokidar.watch([
    path.join(ROOT_DIR, 'manifest.json'),
    path.join(ROOT_DIR, 'bootstrap.js'),
    path.join(ROOT_DIR, 'prefs.js'),
    path.join(ROOT_DIR, 'chrome')
  ], {
    ignored: EXCLUDE_PATTERNS,
    persistent: true
  });
  
  let debounceTimer;
  
  const rebuild = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        await buildXPI(true);
      } catch (err) {
        console.error('Build failed:', err.message);
      }
    }, 500);
  };
  
  watcher.on('change', (path) => {
    console.log(`Changed: ${path}`);
    rebuild();
  });
  
  watcher.on('add', (path) => {
    console.log(`Added: ${path}`);
    rebuild();
  });
  
  // Initial build
  await buildXPI(true);
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const isDev = args.includes('--dev');
  const isWatch = args.includes('--watch');
  
  try {
    if (isWatch) {
      await watchMode();
    } else {
      await buildXPI(isDev);
    }
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

main();
