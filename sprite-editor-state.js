// === Constants ===
export const PIXEL_SIZE = 16;
export const CANVAS_SCALE = 16;
export const CANVAS_SIZE = PIXEL_SIZE * CANVAS_SCALE;
export const MAX_FRAMES = 20;
export const MAX_COLORS = 64;
export const STORAGE_KEY = 'spriteEditorState';
export const VERSION = '1.2';

// Default palette (expanded with common colors)
const DEFAULT_PALETTE = [
    null,
    '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#FF8800', '#8800FF',
    '#0088FF', '#88FF00', '#FF0088', '#888888', '#444444',
    '#888800', '#008888', '#880088', '#AA5500', '#5500AA'
];

// Add a transparent color constant
export const TRANSPARENT_COLOR = null; // Use null for transparent

// === State Class ===
export class SpriteEditorState {
    constructor() {
        this.frames = [];
        this.currentFrame = 0;
        this.currentColor = 1;
        this.currentTool = 'brush';
        this.brushSize = 1;
        this.isPlaying = false;
        this.animationInterval = null;
        this.palette = [...DEFAULT_PALETTE];
        this.version = VERSION;
        this.showGrid = true;
        this.showCheckerboard = true;
        this.initEmptyState();
    }

    createEmptyFrame() {
        const frame = [];
        for (let y = 0; y < PIXEL_SIZE; y++) {
            frame[y] = [];
            for (let x = 0; x < PIXEL_SIZE; x++) {
                frame[y][x] = TRANSPARENT_COLOR; // Use null for transparent
            }
        }
        return frame;
    }

    initEmptyState() {
        if (this.frames.length === 0) {
            this.frames.push(this.createEmptyFrame());
        }
    }

    addFrame(copyCurrent = true) {
        if (this.frames.length >= MAX_FRAMES) {
            throw new Error(`Maximum ${MAX_FRAMES} frames reached`);
        }
        
        let newFrame;
        if (copyCurrent && this.frames.length > 0) {
            newFrame = JSON.parse(JSON.stringify(this.frames[this.currentFrame]));
        } else {
            newFrame = this.createEmptyFrame();
        }
        
        this.frames.push(newFrame);
        this.currentFrame = this.frames.length - 1;
        return newFrame;
    }

    deleteFrame() {
        if (this.frames.length <= 1) {
            throw new Error("Cannot delete the last frame");
        }
        
        this.frames.splice(this.currentFrame, 1);
        this.currentFrame = Math.min(this.currentFrame, this.frames.length - 1);
    }

    duplicateFrame() {
        return this.addFrame(true);
    }

    drawPixel(x, y, colorIndex = this.currentColor, brushSize = this.brushSize) {
        if (x < 0 || x >= PIXEL_SIZE || y < 0 || y >= PIXEL_SIZE) return false;
        
        const frame = this.frames[this.currentFrame];
        
        if (brushSize === 1) {
            frame[y][x] = colorIndex === -1 ? 0 : colorIndex; // Map -1 to 0 for eraser
        } else {
            const radius = Math.floor(brushSize / 2);
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const px = x + dx;
                    const py = y + dy;
                    if (px >= 0 && px < PIXEL_SIZE && py >= 0 && py < PIXEL_SIZE) {
                        frame[py][px] = colorIndex === -1 ? 0 : colorIndex;
                    }
                }
            }
        }
        
        return true;
    }

    fillArea(x, y, targetColor, fillColor) {
        if (x < 0 || x >= PIXEL_SIZE || y < 0 || y >= PIXEL_SIZE) return;
        
        const frame = this.frames[this.currentFrame];
        if (frame[y][x] !== targetColor || targetColor === fillColor) return;
        
        const stack = [[x, y]];
        
        while (stack.length > 0) {
            const [cx, cy] = stack.pop();
            if (cx < 0 || cx >= PIXEL_SIZE || cy < 0 || cy >= PIXEL_SIZE) continue;
            if (frame[cy][cx] !== targetColor) continue;
            
            frame[cy][cx] = fillColor;
            
            stack.push([cx + 1, cy]);
            stack.push([cx - 1, cy]);
            stack.push([cx, cy + 1]);
            stack.push([cx, cy - 1]);
        }
    }

    drawRectangle(x1, y1, x2, y2, colorIndex) {
        const startX = Math.max(0, Math.min(x1, x2));
        const endX = Math.min(PIXEL_SIZE - 1, Math.max(x1, x2));
        const startY = Math.max(0, Math.min(y1, y2));
        const endY = Math.min(PIXEL_SIZE - 1, Math.max(y1, y2));
        
        const frame = this.frames[this.currentFrame];
        for (let y = startY; y <= endY; y++) {
            for (let x = startX; x <= endX; x++) {
                frame[y][x] = colorIndex;
            }
        }
    }

    drawLine(x1, y1, x2, y2, colorIndex) {
        const frame = this.frames[this.currentFrame];
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const sx = x1 < x2 ? 1 : -1;
        const sy = y1 < y2 ? 1 : -1;
        let err = dx - dy;
        
        while (true) {
            if (x1 >= 0 && x1 < PIXEL_SIZE && y1 >= 0 && y1 < PIXEL_SIZE) {
                frame[y1][x1] = colorIndex;
            }
            
            if (x1 === x2 && y1 === y2) break;
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x1 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y1 += sy;
            }
        }
    }

    addColor(hexColor) {
        if (this.palette.length >= MAX_COLORS) {
            throw new Error(`Maximum ${MAX_COLORS} colors reached`);
        }
        
        if (!/^#[0-9A-F]{6}$/i.test(hexColor)) {
            throw new Error('Please enter a valid hex color (e.g., #FF0000)');
        }
        
        hexColor = hexColor.toUpperCase();
        
        // Check if color already exists
        const existingIndex = this.palette.indexOf(hexColor);
        if (existingIndex !== -1) {
            this.currentColor = existingIndex;
            throw new Error('This color is already in the palette!');
        }
        
        this.palette.push(hexColor);
        this.currentColor = this.palette.length - 1;
        return hexColor;
    }

    deleteColor(index) {
        if (index < DEFAULT_PALETTE.length) {
            throw new Error('Cannot delete default colors');
        }
        
        if (this.palette.length <= DEFAULT_PALETTE.length) {
            throw new Error('Must keep at least 20 colors');
        }
        
        // Remove color from palette
        this.palette.splice(index, 1);
        
        // Update all frames to use index 0 for deleted color
        for (let f = 0; f < this.frames.length; f++) {
            for (let y = 0; y < PIXEL_SIZE; y++) {
                for (let x = 0; x < PIXEL_SIZE; x++) {
                    if (this.frames[f][y][x] === index) {
                        this.frames[f][y][x] = 0; // Changed to 0 (black)
                    } else if (this.frames[f][y][x] > index) {
                        this.frames[f][y][x]--;
                    }
                }
            }
        }
        
        // Adjust current color if needed
        if (this.currentColor === index) {
            this.currentColor = 0; // Changed from 1 to 0 - default to black when deleting current color
        } else if (this.currentColor > index) {
            this.currentColor--;
        }
    }

    getStateForExport() {
        return {
            palette: this.palette,
            frames: this.frames,
            currentFrame: this.currentFrame,
            currentColor: this.currentColor,
            currentTool: this.currentTool,
            brushSize: this.brushSize,
            showGrid: this.showGrid,
            showCheckerboard: this.showCheckerboard,
            size: PIXEL_SIZE,
            version: this.version,
            exported: new Date().toISOString()
        };
    }

    loadState(state) {
        // Validate state
        if (!state || !state.palette || !state.frames) {
            throw new Error('Invalid state format');
        }

        // Merge palettes, preserving defaults
        const mergedPalette = [...DEFAULT_PALETTE];
        const colorMap = new Map();
        
        // Map imported colors to our palette
        state.palette.forEach((color, index) => {
            if (!DEFAULT_PALETTE.includes(color)) {
                const existingIndex = mergedPalette.indexOf(color);
                if (existingIndex === -1 && mergedPalette.length < MAX_COLORS) {
                    mergedPalette.push(color);
                    colorMap.set(index, mergedPalette.length - 1);
                } else if (existingIndex !== -1) {
                    colorMap.set(index, existingIndex);
                }
            } else {
                colorMap.set(index, DEFAULT_PALETTE.indexOf(color));
            }
        });

        // Remap frames
        const remappedFrames = state.frames.map(frame => {
            const newFrame = [];
            for (let y = 0; y < PIXEL_SIZE; y++) {
                newFrame[y] = [];
                for (let x = 0; x < PIXEL_SIZE; x++) {
                    const oldIndex = frame[y]?.[x] || 0;
                    newFrame[y][x] = colorMap.get(oldIndex) || 0;
                }
            }
            return newFrame;
        });

        this.palette = mergedPalette;
        this.frames = remappedFrames;
        this.currentFrame = Math.min(state.currentFrame || 0, remappedFrames.length - 1);
        this.currentColor = Math.min(state.currentColor || 1, mergedPalette.length - 1);
        this.currentTool = state.currentTool || 'brush';
        this.brushSize = state.brushSize || 1;
        this.showGrid = state.showGrid !== undefined ? state.showGrid : true;
        this.showCheckerboard = state.showCheckerboard !== undefined ? state.showCheckerboard : true;
        
        if (this.frames.length === 0) {
            this.frames.push(this.createEmptyFrame());
        }
    }

    saveToLocalStorage() {
        try {
            const state = {
                palette: this.palette,
                frames: this.frames,
                currentFrame: this.currentFrame,
                currentColor: this.currentColor,
                currentTool: this.currentTool,
                brushSize: this.brushSize,
                showGrid: this.showGrid,
                showCheckerboard: this.showCheckerboard,
                version: this.version,
                savedAt: new Date().toISOString()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            return true;
        } catch (error) {
            console.error('Failed to save state:', error);
            return false;
        }
    }

    loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const state = JSON.parse(saved);
                this.loadState(state);
                return true;
            }
        } catch (error) {
            console.error('Failed to load state:', error);
        }
        return false;
    }

    clearLocalStorage() {
        localStorage.removeItem(STORAGE_KEY);
    }
}