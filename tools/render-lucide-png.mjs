import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as LucideIcons from 'lucide-react';
import sharp from 'sharp';

const [, , firstArg = '', secondArg = '128', thirdArg = './', fourthArg] = process.argv;

const resolveIconName = (rawName) => {
    if (!rawName) return null;
    const text = String(rawName).trim();
    if (!text) return null;
    const exact = LucideIcons[text];
    if (exact) return text;

    const match = Object.keys(LucideIcons)
        .filter((key) => /^[A-Z]/.test(key))
        .find((key) => key.toLowerCase() === text.toLowerCase());

    return match || null;
};

const isHexColor = (value) => /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value.trim());

const listIcons = () => {
    const names = Object.keys(LucideIcons)
        .filter((key) => /^[A-Z]/.test(key))
        .sort();

    console.log(`Renderable Lucide SVGs (${names.length}):`);
    console.log(names.join('\n'));
};

const renderOne = async ({ iconName, size, color, destination }) => {
    const icon = LucideIcons[iconName];
    const svgMarkup = renderToStaticMarkup(
        React.createElement(icon, {
            size,
            strokeWidth: 2,
            color,
            fill: 'none',
            'aria-label': iconName,
        })
    );

    const svgString = svgMarkup.trim();
    const outDir = path.dirname(destination);
    if (outDir && outDir !== '.') {
        fs.mkdirSync(outDir, { recursive: true });
    }

    await sharp(Buffer.from(svgString))
        .resize(size, size)
        .png()
        .toFile(destination);

    console.log(`Rendered ${iconName} (${color}) to ${destination}`);
};

if (firstArg === 'list' || firstArg === '--list' || firstArg === '-l') {
    listIcons();
    process.exit(0);
}

if (firstArg === 'all' || firstArg === '--all' || firstArg === '-a') {
    const color = isHexColor(secondArg) ? secondArg : '#000000';
    const sizesArg = thirdArg || '16,32,64,128,256';
    const destDir = fourthArg || './assets/icons';
    const sizes = sizesArg.split(',').map((item) => Number.parseInt(item.trim(), 10)).filter((n) => !Number.isNaN(n));

    if (sizes.length === 0) {
        console.error('Usage: npm run render-svg:lucide-react all <color> <sizesCSV> <destinationDir>');
        process.exit(1);
    }

    const iconNames = Object.keys(LucideIcons)
        .filter((key) => /^[A-Z]/.test(key))
        .sort();

    fs.mkdirSync(destDir, { recursive: true });

    for (const iconName of iconNames) {
        for (const size of sizes) {
            const destination = path.resolve(path.join(destDir, `${iconName.toLowerCase()}-${size}.png`));
            await renderOne({ iconName, size, color, destination });
        }
    }

    process.exit(0);
}

const iconName = resolveIconName(firstArg);
if (!iconName) {
    const names = Object.keys(LucideIcons)
        .filter((key) => /^[A-Z]/.test(key))
        .sort()
        .slice(0, 12)
        .join(', ');

    console.error(`Usage: npm run render-svg:lucide-react <icon|list|all> [color] [size] [destinationPath]\nExample: npm run render-svg:lucide-react activity #ff0000 128 ./assets/icons\nExample: npm run render-svg:lucide-react activity 128 ./assets/icons\nExample: npm run render-svg:lucide-react list\nExample: npm run render-svg:lucide-react all #ff0000 16,32,64,128,256 ./assets/icons\nTry one of: ${names}`);
    process.exit(1);
}

const colorCandidate = isHexColor(secondArg) ? secondArg : null;
const size = Number.parseInt(colorCandidate ? thirdArg || '128' : secondArg || '128', 10) || 128;
const destArg = colorCandidate ? (fourthArg || './') : (thirdArg || './');
const finalColor = colorCandidate || '#000000';
const isDirectoryLike = !path.extname(destArg) || destArg.endsWith('/') || destArg.endsWith('\\');
const targetDir = isDirectoryLike ? destArg : path.dirname(destArg);
const outputFileName = isDirectoryLike ? `${iconName.toLowerCase()}-${size}.png` : path.basename(destArg);
const outputPath = path.resolve(path.join(targetDir, outputFileName));

await renderOne({ iconName, size, color: finalColor, destination: outputPath });
