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
        if (!targetRgb) return 0;
        
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
                    const canvasWidth = this.state.canvasWidth || PIXEL_SIZE;
                    const canvasHeight = this.state.canvasHeight || PIXEL_SIZE;
                    
                    if (img.width !== canvasWidth || img.height !== canvasHeight) {
                        reject(new Error(`Image must be exactly ${canvasWidth}×${canvasHeight} pixels. Current size: ${img.width}×${img.height}`));
                        return;
                    }
                    
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
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasWidth;
        tempCanvas.height = canvasHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0);
        
        const imageData = tempCtx.getImageData(0, 0, canvasWidth, canvasHeight);
        const data = imageData.data;
        
        // Extract colors and create new frame
        const newFrame = this.state.createEmptyFrame();
        const foundColors = new Set();
        const colorMap = new Map();
        
        // First pass: collect all unique colors (skip transparent)
        for (let y = 0; y < canvasHeight; y++) {
            for (let x = 0; x < canvasWidth; x++) {
                const idx = (y * canvasWidth + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const a = data[idx + 3];
                
                if (a > 128) {
                    const hex = this.rgbToHex(r, g, b);
                    foundColors.add(hex);
                }
            }
        }
        
        // Add missing colors to palette
        for (const hexColor of foundColors) {
            let colorIndex = this.state.palette.indexOf(hexColor);
            if (colorIndex === -1) {
                if (this.state.palette.length < MAX_COLORS) {
                    this.state.palette.push(hexColor);
                    colorIndex = this.state.palette.length - 1;
                    colorMap.set(hexColor, colorIndex);
                } else {
                    const closestIndex = this.findClosestColor(hexColor);
                    colorMap.set(hexColor, closestIndex);
                }
            } else {
                colorMap.set(hexColor, colorIndex);
            }
        }
        
        // Second pass: populate the new frame
        for (let y = 0; y < canvasHeight; y++) {
            for (let x = 0; x < canvasWidth; x++) {
                const idx = (y * canvasWidth + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const a = data[idx + 3];
                
                if (a > 128) {
                    const hex = this.rgbToHex(r, g, b);
                    const colorIndex = colorMap.get(hex) || 1;
                    newFrame[y][x] = colorIndex;
                } else {
                    newFrame[y][x] = 0;
                }
            }
        }
        
        // Add the new frame
        this.state.frames.push(newFrame);
        this.state.currentFrame = this.state.frames.length - 1;
        
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
        
        // Create download link
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `sprite_project_${Date.now()}.json`;
        link.href = url;
        link.click();
        
        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }
    
    async importJSON(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    // Validate JSON structure
                    if (!this.validateImportData(data)) {
                        reject(new Error('Invalid sprite project file format'));
                        return;
                    }
                    
                    // Check compatibility
                    const canvasWidth = this.state.canvasWidth || PIXEL_SIZE;
                    const canvasHeight = this.state.canvasHeight || PIXEL_SIZE;
                    
                    if (data.canvasWidth !== canvasWidth || data.canvasHeight !== canvasHeight) {
                        if (!confirm(`Project size (${data.canvasWidth}x${data.canvasHeight}) differs from current size (${canvasWidth}x${canvasHeight}). Resize canvas to match?`)) {
                            reject(new Error('Canvas size mismatch'));
                            return;
                        }
                    }
                    
                    // Load the data into state
                    this.loadStateFromData(data);
                    resolve({ framesCount: data.frames.length });
                } catch (error) {
                    reject(new Error(`Failed to parse JSON: ${error.message}`));
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }
    
    validateImportData(data) {
        // Check required properties
        const requiredProps = ['palette', 'frames', 'canvasWidth', 'canvasHeight'];
        for (const prop of requiredProps) {
            if (!data.hasOwnProperty(prop)) {
                return false;
            }
        }
        
        // Validate palette
        if (!Array.isArray(data.palette) || 
            data.palette.length > MAX_COLORS ||
            data.palette.length === 0) {
            return false;
        }
        
        // Validate palette colors
        for (const color of data.palette) {
            if (!/^#[0-9A-F]{6}$/i.test(color)) {
                return false;
            }
        }
        
        // Validate frames
        if (!Array.isArray(data.frames) || data.frames.length === 0) {
            return false;
        }
        
        // Validate each frame
        for (const frame of data.frames) {
            if (!Array.isArray(frame) || frame.length !== data.canvasHeight) {
                return false;
            }
            
            for (const row of frame) {
                if (!Array.isArray(row) || row.length !== data.canvasWidth) {
                    return false;
                }
                
                // Validate pixel values are valid indices into palette
                for (const pixel of row) {
                    if (!Number.isInteger(pixel) || pixel < 0 || pixel >= data.palette.length) {
                        return false;
                    }
                }
            }
        }
        
        return true;
    }
    
    loadStateFromData(data) {
        // Backup current state in case of failure
        const backup = this.state.getStateForExport();
        
        try {
            // Update canvas dimensions
            this.state.canvasWidth = data.canvasWidth;
            this.state.canvasHeight = data.canvasHeight;
            
            // Update palette
            this.state.palette = [...data.palette];
            
            // Update frames
            this.state.frames = data.frames.map(frame => 
                frame.map(row => [...row])
            );
            
            // Reset current frame
            this.state.currentFrame = 0;
            
            // Update UI if needed
            if (this.ui && typeof this.ui.onProjectLoaded === 'function') {
                this.ui.onProjectLoaded();
            }
        } catch (error) {
            // Restore backup on error
            this.loadStateFromData(backup);
            throw error;
        }
    }
    
    clearProject() {
        if (!confirm('Are you sure you want to clear the entire project? This cannot be undone.')) {
            return;
        }
        
        // Reset to defaults
        this.state.palette = ['#000000', '#FFFFFF'];
        this.state.frames = [this.state.createEmptyFrame()];
        this.state.currentFrame = 0;
        
        // Reset selection and tools
        this.state.selection = null;
        this.state.isDrawing = false;
        this.state.lastX = -1;
        this.state.lastY = -1;
        
        // Update UI
        if (this.ui && typeof this.ui.onProjectCleared === 'function') {
            this.ui.onProjectCleared();
        }
    }
    
    exportAsPalette() {
        const paletteData = {
            name: `sprite_palette_${Date.now()}`,
            colors: this.state.palette.slice(1), // Skip transparent color
            author: "Pixel Art Editor",
            created: new Date().toISOString()
        };
        
        const jsonStr = JSON.stringify(paletteData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `${paletteData.name}.json`;
        link.href = url;
        link.click();
        
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }
    
    async importPalette(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    // Validate palette format
                    if (!data.colors || !Array.isArray(data.colors)) {
                        reject(new Error('Invalid palette format: missing colors array'));
                        return;
                    }
                    
                    // Validate color format
                    for (const color of data.colors) {
                        if (!/^#[0-9A-F]{6}$/i.test(color)) {
                            reject(new Error(`Invalid color format: ${color}`));
                            return;
                        }
                    }
                    
                    // Check if palette fits
                    const availableSlots = MAX_COLORS - 1; // -1 for transparent
                    if (data.colors.length > availableSlots) {
                        reject(new Error(`Palette too large. Maximum ${availableSlots} colors allowed.`));
                        return;
                    }
                    
                    // Apply palette (keep transparent color at index 0)
                    this.state.palette = ['#000000', ...data.colors];
                    
                    resolve({ colorCount: data.colors.length });
                } catch (error) {
                    reject(new Error(`Failed to import palette: ${error.message}`));
                }
            };
            reader.onerror = () => reject(new Error('Failed to read palette file'));
            reader.readAsText(file);
        });
    }
    
    exportAsSpriteSheet() {
        const frames = this.state.frames;
        const canvasWidth = this.state.canvasWidth || PIXEL_SIZE;
        const canvasHeight = this.state.canvasHeight || PIXEL_SIZE;
        const columns = Math.ceil(Math.sqrt(frames.length));
        const rows = Math.ceil(frames.length / columns);
        
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth * columns;
        canvas.height = canvasHeight * rows;
        const ctx = canvas.getContext('2d');
        
        // Create transparent background
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw all frames in a grid
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            const col = i % columns;
            const row = Math.floor(i / columns);
            const xOffset = col * canvasWidth;
            const yOffset = row * canvasHeight;
            
            for (let y = 0; y < canvasHeight; y++) {
                for (let x = 0; x < canvasWidth; x++) {
                    const colorIndex = frame[y][x];
                    if (colorIndex > 0 && colorIndex < this.state.palette.length) {
                        const color = this.state.palette[colorIndex];
                        if (color) {
                            ctx.fillStyle = color;
                            ctx.fillRect(xOffset + x, yOffset + y, 1, 1);
                        }
                    }
                }
            }
        }
        
        // Add grid lines
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.lineWidth = 1;
        
        // Vertical lines
        for (let i = 1; i < columns; i++) {
            ctx.beginPath();
            ctx.moveTo(i * canvasWidth, 0);
            ctx.lineTo(i * canvasWidth, canvas.height);
            ctx.stroke();
        }
        
        // Horizontal lines
        for (let i = 1; i < rows; i++) {
            ctx.beginPath();
            ctx.moveTo(0, i * canvasHeight);
            ctx.lineTo(canvas.width, i * canvasHeight);
            ctx.stroke();
        }
        
        // Create download link
        const link = document.createElement('a');
        link.download = `sprite_sheet_${canvasWidth}x${canvasHeight}_${frames.length}frames_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }
    
    createThumbnail(size = 64) {
        const frame = this.state.frames[this.state.currentFrame];
        const canvasWidth = this.state.canvasWidth || PIXEL_SIZE;
        const canvasHeight = this.state.canvasHeight || PIXEL_SIZE;
        
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // Create white background for thumbnail
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);
        
        // Calculate scaling
        const scale = Math.min(size / canvasWidth, size / canvasHeight);
        const scaledWidth = canvasWidth * scale;
        const scaledHeight = canvasHeight * scale;
        const offsetX = (size - scaledWidth) / 2;
        const offsetY = (size - scaledHeight) / 2;
        
        // Draw scaled sprite with nearest-neighbor interpolation
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasWidth;
        tempCanvas.height = canvasHeight;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Draw the sprite at original size
        for (let y = 0; y < canvasHeight; y++) {
            for (let x = 0; x < canvasWidth; x++) {
                const colorIndex = frame[y][x];
                if (colorIndex > 0 && colorIndex < this.state.palette.length) {
                    const color = this.state.palette[colorIndex];
                    if (color) {
                        tempCtx.fillStyle = color;
                        tempCtx.fillRect(x, y, 1, 1);
                    }
                }
            }
        }
        
        // Scale up using nearest-neighbor
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tempCanvas, 0, 0, canvasWidth, canvasHeight, 
                      offsetX, offsetY, scaledWidth, scaledHeight);
        
        return canvas.toDataURL('image/png');
    }

}