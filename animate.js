import { SpriteEditorState, PIXEL_SIZE, CANVAS_SCALE } from './sprite-editor-state.js';
import { SpriteEditorUI } from './sprite-editor-ui.js';
import { SpriteEditorFileOps } from './sprite-editor-file-ops.js';

class SpriteEditorApp {
    constructor() {
        this.state = new SpriteEditorState();
        this.ui = new SpriteEditorUI(this.state);
        this.fileOps = new SpriteEditorFileOps(this.state, this.ui);
        this.isDrawing = false;
        this.startX = -1;
        this.startY = -1;
        
        // Store constants locally
        this.PIXEL_SIZE = PIXEL_SIZE;
        this.CANVAS_SCALE = CANVAS_SCALE;
        
        this.init();
    }

    init() {
        // Load saved state or initialize
        if (!this.state.loadFromLocalStorage()) {
            this.state.initEmptyState();
        }
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Initial render
        this.ui.updateColorPalette();
        this.ui.updateFrameThumbnails();
        this.ui.drawFrame();
        
        // Update display option buttons
        this.updateDisplayButtons();
        
        // Auto-save on unload
        window.addEventListener('beforeunload', () => {
            this.state.saveToLocalStorage();
        });
        
        // Auto-save every 30 seconds
        setInterval(() => {
            this.state.saveToLocalStorage();
        }, 30000);
    }

    setupEventListeners() {
        // Canvas events
        this.ui.mainCanvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.ui.mainCanvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.ui.mainCanvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.ui.mainCanvas.addEventListener('mouseleave', () => this.handleMouseLeave());
        
        // Tool selection
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.state.currentTool = btn.dataset.tool;
                this.ui.updateStatusBar();
                this.state.saveToLocalStorage();
            });
        });
        
        // Brush size
        this.ui.elements.brushSize.addEventListener('input', (e) => {
            this.state.brushSize = parseInt(e.target.value);
            this.ui.updateStatusBar();
            this.state.saveToLocalStorage();
        });
        
        // Frame controls
        document.getElementById('addFrameBtn').addEventListener('click', () => this.addFrame(false));
        document.getElementById('duplicateFrameBtn').addEventListener('click', () => this.duplicateFrame());
        document.getElementById('deleteFrameBtn').addEventListener('click', () => this.deleteFrame());
        document.getElementById('prevFrameBtn').addEventListener('click', () => this.prevFrame());
        document.getElementById('nextFrameBtn').addEventListener('click', () => this.nextFrame());
        
        // Animation controls
        document.getElementById('playBtn').addEventListener('click', () => this.playAnimation());
        document.getElementById('pauseBtn').addEventListener('click', () => this.pauseAnimation());
        
        // Color controls
        document.getElementById('addColorBtn').addEventListener('click', () => this.ui.addColorFromInput());
        document.getElementById('deleteColorBtn').addEventListener('click', () => {
            this.ui.deleteColor(this.state.currentColor);
        });
        
        this.ui.elements.colorPicker.addEventListener('input', (e) => {
            this.ui.elements.colorInput.value = e.target.value;
        });
        
        this.ui.elements.colorInput.addEventListener('change', (e) => {
            this.ui.elements.colorPicker.value = e.target.value;
        });
        
        // File operations
        document.getElementById('importPNGBtn').addEventListener('click', () => {
            this.ui.elements.importFile.click();
        });
        
        this.ui.elements.importFile.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this.importPNG(e.target.files[0]);
            }
        });
        
        document.getElementById('exportPNGBtn').addEventListener('click', () => this.fileOps.exportPNG());
        document.getElementById('exportJSONBtn').addEventListener('click', () => this.fileOps.exportJSON());
        
        // Display options
        if (this.ui.elements.toggleGridBtn) {
            this.ui.elements.toggleGridBtn.addEventListener('click', () => this.ui.toggleGrid());
        }
        
        if (this.ui.elements.toggleCheckerboardBtn) {
            this.ui.elements.toggleCheckerboardBtn.addEventListener('click', () => this.ui.toggleCheckerboard());
        }
    }

    updateDisplayButtons() {
        if (this.ui.elements.toggleGridBtn) {
            this.ui.elements.toggleGridBtn.textContent = this.state.showGrid ? 'Hide Grid' : 'Show Grid';
        }
        
        if (this.ui.elements.toggleCheckerboardBtn) {
            this.ui.elements.toggleCheckerboardBtn.textContent = this.state.showCheckerboard ? 'Solid Background' : 'Checkerboard';
        }
    }

    handleMouseDown(e) {
        if (this.state.isPlaying) return;
        
        const rect = this.ui.mainCanvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / CANVAS_SCALE);
        const y = Math.floor((e.clientY - rect.top) / CANVAS_SCALE);
        
        if (x < 0 || x >= PIXEL_SIZE || y < 0 || y >= PIXEL_SIZE) return;
        
        this.isDrawing = true;
        this.startX = x;
        this.startY = y;
        
        switch (this.state.currentTool) {
            case 'brush':
                this.state.drawPixel(x, y, this.state.currentColor);
                this.ui.drawFrame();
                this.state.saveToLocalStorage();
                break;
                
                case 'eraser':
                    this.state.drawPixel(x, y, 0); // 0 = transparent
                    this.ui.drawFrame();
                    this.state.saveToLocalStorage();
                    break;
                
            case 'eyedropper':
                const frame = this.state.frames[this.state.currentFrame];
                const pickedColor = frame[y][x];
                if (pickedColor !== -1) { // Don't pick eraser/transparent
                    this.state.currentColor = pickedColor;
                    this.ui.updateColorPalette();
                    this.ui.updateStatusBar();
                }
                break;
                
            case 'fill':
                const targetColor = this.state.frames[this.state.currentFrame][y][x];
                this.state.fillArea(x, y, targetColor, this.state.currentColor);
                this.ui.drawFrame();
                this.state.saveToLocalStorage();
                break;
        }
    }

    handleMouseMove(e) {
        const rect = this.ui.mainCanvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / this.CANVAS_SCALE); // Use this.CANVAS_SCALE
        const y = Math.floor((e.clientY - rect.top) / this.CANVAS_SCALE); // Use this.CANVAS_SCALE
        
        // Update mouse position display
        this.ui.elements.mousePos.textContent = `X:${x}, Y:${y}`;
        
        if (!this.isDrawing) return;
        
        switch (this.state.currentTool) {
            case 'brush':
            case 'eraser':
                const color = this.state.currentTool === 'eraser' ? 0 : this.state.currentColor;
                this.state.drawPixel(x, y, color);
                this.ui.drawFrame();
                break;
        }
    }

    handleMouseUp(e) {
        if (!this.isDrawing) return;
        
        const rect = this.ui.mainCanvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / this.CANVAS_SCALE); // Use this.CANVAS_SCALE
        const y = Math.floor((e.clientY - rect.top) / this.CANVAS_SCALE); // Use this.CANVAS_SCALE
        
        switch (this.state.currentTool) {
            case 'line':
                this.state.drawLine(this.startX, this.startY, x, y, this.state.currentColor);
                this.ui.drawFrame();
                this.state.saveToLocalStorage();
                break;
                
            case 'rectangle':
                this.state.drawRectangle(this.startX, this.startY, x, y, this.state.currentColor);
                this.ui.drawFrame();
                this.state.saveToLocalStorage();
                break;
        }
        
        this.isDrawing = false;
        this.startX = -1;
        this.startY = -1;
    }

    handleMouseLeave() {
        this.isDrawing = false;
        this.startX = -1;
        this.startY = -1;
        this.ui.elements.mousePos.textContent = 'X:0, Y:0';
    }

    // Frame management methods
    addFrame(copyCurrent = false) {
        try {
            this.state.addFrame(copyCurrent);
            this.ui.updateFrameThumbnails();
            this.ui.drawFrame();
            this.state.saveToLocalStorage();
            this.ui.showAlert('Frame added successfully', 'success');
        } catch (error) {
            this.ui.showAlert(error.message, 'error');
        }
    }

    duplicateFrame() {
        this.addFrame(true);
    }

    deleteFrame() {
        try {
            this.state.deleteFrame();
            this.ui.updateFrameThumbnails();
            this.ui.drawFrame();
            this.state.saveToLocalStorage();
            this.ui.showAlert('Frame deleted successfully', 'success');
        } catch (error) {
            this.ui.showAlert(error.message, 'error');
        }
    }

    prevFrame() {
        if (!this.state.isPlaying && this.state.frames.length > 1) {
            this.state.currentFrame = (this.state.currentFrame - 1 + this.state.frames.length) % this.state.frames.length;
            this.ui.drawFrame();
            this.ui.updateFrameThumbnails();
            this.state.saveToLocalStorage();
        }
    }

    nextFrame() {
        if (!this.state.isPlaying && this.state.frames.length > 1) {
            this.state.currentFrame = (this.state.currentFrame + 1) % this.state.frames.length;
            this.ui.drawFrame();
            this.ui.updateFrameThumbnails();
            this.state.saveToLocalStorage();
        }
    }

    // Animation methods
    playAnimation() {
        if (this.state.isPlaying || this.state.frames.length < 2) return;
        
        this.state.isPlaying = true;
        const speed = parseInt(this.ui.elements.animationSpeed.value) || 200;
        
        this.state.animationInterval = setInterval(() => {
            this.state.currentFrame = (this.state.currentFrame + 1) % this.state.frames.length;
            this.ui.drawFrame();
            this.ui.updateFrameThumbnails();
        }, speed);
    }

    pauseAnimation() {
        this.state.isPlaying = false;
        if (this.state.animationInterval) {
            clearInterval(this.state.animationInterval);
            this.state.animationInterval = null;
        }
    }

    async importPNG(file) {
        console.log('Starting PNG import...', file.name, file.size);
        try {
            const result = await this.fileOps.importPNG(file);
            console.log('PNG import result:', result);
            this.ui.showAlert(`PNG imported successfully! Found ${result.colorCount} unique colors.`, 'success');
            
            // Debug: Check what was imported
            console.log('Current frame after import:', this.state.currentFrame);
            console.log('Total frames:', this.state.frames.length);
            console.log('Frame data:', this.state.frames[this.state.currentFrame]);
            
            // Force a UI update
            this.ui.drawFrame();
            this.ui.updateFrameThumbnails();
            
        } catch (error) {
            console.error('PNG import error:', error);
            this.ui.showAlert(error.message, 'error');
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.spriteEditor = new SpriteEditorApp();
});