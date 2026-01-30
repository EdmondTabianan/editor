import { SpriteEditorState } from './sprite-editor-state.js';
import { PIXEL_SIZE, MAX_COLORS } from './constants.js';
export class SpriteEditorFileOps {
    constructor(state, ui) {
        this.state = state;
        this.ui = ui;
    }

    rgbToHex(r, g, b) {
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    findClosestColor(hex) {
        const targetRgb = this.hexToRgb(hex);
        if (!targetRgb) return 0; // Default to transparent
        
        let closestIndex = 0;
        let minDistance = Infinity;
        
        for (let i = 0; i < this.state.palette.length; i++) {
            const rgb = this.hexToRgb(this.state.palette[i]);
            if (rgb) {
                const distance = Math.sqrt(
                    Math.pow(targetRgb.r - rgb.r, 2) +
                    Math.pow(targetRgb.g - rgb.g, 2) +
                    Math.pow(targetRgb.b - rgb.b, 2)
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closestIndex = i;
                }
            }
        }
        
        return closestIndex;
    }

    async importPNG(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    // Validate dimensions
                    const canvasWidth = this.state.canvasWidth || PIXEL_SIZE;
                    const canvasHeight = this.state.canvasHeight || PIXEL_SIZE;
                    
                    if (img.width !== canvasWidth || img.height !== canvasHeight) {
                        reject(new Error(`Image must be exactly ${canvasWidth}×${canvasHeight} pixels. Current size: ${img.width}×${img.height}`));
                        return;
                    }
                    
                    // Process image
                    this.processImageData(img).then(resolve).catch(reject);
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async processImageData(img) {
        const canvasWidth = this.state.canvasWidth || PIXEL_SIZE;
        const canvasHeight = this.state.canvasHeight || PIXEL_SIZE;
        
        console.log('Processing image data...', img.width, img.height, 'Canvas size:', canvasWidth, canvasHeight);
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasWidth;
        tempCanvas.height = canvasHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0);
        
        const imageData = tempCtx.getImageData(0, 0, canvasWidth, canvasHeight);
        const data = imageData.data;
        console.log('Image data length:', data.length);
        
        // Extract colors and create new frame
        const newFrame = this.state.createEmptyFrame();
        const foundColors = new Set();
        const colorMap = new Map();
        
        // First pass: collect all unique colors (skip transparent)
        console.log('Collecting unique colors...');
        for (let y = 0; y < canvasHeight; y++) {
            for (let x = 0; x < canvasWidth; x++) {
                const idx = (y * canvasWidth + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const a = data[idx + 3];
                
                if (a > 128) { // Semi-transparent threshold
                    const hex = this.rgbToHex(r, g, b);
                    foundColors.add(hex);
                }
            }
        }
        console.log('Found unique colors:', foundColors.size, foundColors);
        
        // Add missing colors to palette
        console.log('Current palette size:', this.state.palette.length);
        for (const hexColor of foundColors) {
            let colorIndex = this.state.palette.indexOf(hexColor);
            console.log(`Color ${hexColor} index: ${colorIndex}`);
            if (colorIndex === -1) {
                if (this.state.palette.length < MAX_COLORS) {
                    this.state.palette.push(hexColor);
                    colorIndex = this.state.palette.length - 1;
                    colorMap.set(hexColor, colorIndex);
                    console.log(`Added new color ${hexColor} at index ${colorIndex}`);
                } else {
                    const closestIndex = this.findClosestColor(hexColor);
                    colorMap.set(hexColor, closestIndex);
                    console.warn(`Palette full, mapping ${hexColor} to closest color at index ${closestIndex}`);
                }
            } else {
                colorMap.set(hexColor, colorIndex);
            }
        }
        
        // Second pass: populate the new frame
        console.log('Populating frame...');
        let opaquePixels = 0;
        let transparentPixels = 0;
        
        for (let y = 0; y < canvasHeight; y++) {
            for (let x = 0; x < canvasWidth; x++) {
                const idx = (y * canvasWidth + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const a = data[idx + 3];
                
                if (a > 128) { // Semi-transparent threshold
                    const hex = this.rgbToHex(r, g, b);
                    const colorIndex = colorMap.get(hex) || 1; // Default to black if not found
                    newFrame[y][x] = colorIndex;
                    opaquePixels++;
                } else {
                    newFrame[y][x] = 0; // Transparent
                    transparentPixels++;
                }
            }
        }
        
        console.log(`Frame populated: ${opaquePixels} opaque, ${transparentPixels} transparent`);
        
        // Add the new frame
        this.state.frames.push(newFrame);
        this.state.currentFrame = this.state.frames.length - 1;
        
        console.log('New frame added at index:', this.state.currentFrame);
        console.log('Total frames now:', this.state.frames.length);
        
        return { colorCount: foundColors.size };
    }

    exportPNG() {
        const frame = this.state.frames[this.state.currentFrame];
        const canvasWidth = this.state.canvasWidth || PIXEL_SIZE;
        const canvasHeight = this.state.canvasHeight || PIXEL_SIZE;
        
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');
        
        // Create transparent background
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        // Draw pixels (skip transparent pixels)
        for (let y = 0; y < canvasHeight; y++) {
            for (let x = 0; x < canvasWidth; x++) {
                const colorIndex = frame[y][x];
                if (colorIndex > 0 && colorIndex < this.state.palette.length) {
                    const color = this.state.palette[colorIndex];
                    if (color) {
                        ctx.fillStyle = color;
                        ctx.fillRect(x, y, 1, 1);
                    }
                }
            }
        }
        
        // Create download link
        const link = document.createElement('a');
        link.download = `sprite_${canvasWidth}x${canvasHeight}_frame${this.state.currentFrame}_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    exportJSON() {
        const data = this.state.getStateForExport();
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `sprite_${this.state.canvasWidth}x${this.state.canvasHeight}_${Date.now()}.json`;
        link.href = url;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }

    importJSON(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    this.state.loadState(data);
                    this.ui.updateColorPalette();
                    this.ui.updateFrameThumbnails();
                    this.ui.drawFrame();
                    this.state.saveToLocalStorage();
                    resolve();
                } catch (error) {
                    reject(new Error('Invalid JSON file: ' + error.message));
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }
}