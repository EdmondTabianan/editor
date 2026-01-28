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
        
        this.init();
    }

    init() {
        console.log('Initializing Sprite Editor...');
        
        // Load saved state or initialize
        if (!this.state.loadFromLocalStorage()) {
            console.log('No saved state found, initializing empty state');
            this.state.initEmptyState();
        }
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Initial render
        this.ui.updateColorPalette();
        this.ui.updateFrameThumbnails();
        this.ui.drawFrame();
        
        // Update display option buttons if they exist
        if (this.ui.elements.toggleGridBtn) {
            this.ui.elements.toggleGridBtn.textContent = this.state.showGrid ? 'Hide Grid' : 'Show Grid';
        }
        
        if (this.ui.elements.toggleCheckerboardBtn) {
            this.ui.elements.toggleCheckerboardBtn.textContent = this.state.showCheckerboard ? 'Solid Background' : 'Checkerboard';
        }
        
        // Auto-save on unload
        window.addEventListener('beforeunload', () => {
            this.state.saveToLocalStorage();
        });
        
        // Auto-save every 30 seconds
        setInterval(() => {
            this.state.saveToLocalStorage();
        }, 30000);
        
        console.log('Sprite Editor initialized successfully');
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
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
        if (this.ui.elements.brushSize) {
            this.ui.elements.brushSize.addEventListener('input', (e) => {
                this.state.brushSize = parseInt(e.target.value);
                this.ui.updateStatusBar();
                this.state.saveToLocalStorage();
            });
        }
        
        // Frame controls
        const addFrameBtn = document.getElementById('addFrameBtn');
        if (addFrameBtn) {
            addFrameBtn.addEventListener('click', () => this.addFrame(false));
        }
        
        const duplicateFrameBtn = document.getElementById('duplicateFrameBtn');
        if (duplicateFrameBtn) {
            duplicateFrameBtn.addEventListener('click', () => this.duplicateFrame());
        }
        
        const deleteFrameBtn = document.getElementById('deleteFrameBtn');
        if (deleteFrameBtn) {
            deleteFrameBtn.addEventListener('click', () => this.deleteFrame());
        }
        
        const prevFrameBtn = document.getElementById('prevFrameBtn');
        if (prevFrameBtn) {
            prevFrameBtn.addEventListener('click', () => this.prevFrame());
        }
        
        const nextFrameBtn = document.getElementById('nextFrameBtn');
        if (nextFrameBtn) {
            nextFrameBtn.addEventListener('click', () => this.nextFrame());
        }
        
        // Animation controls
        const playBtn = document.getElementById('playBtn');
        if (playBtn) {
            playBtn.addEventListener('click', () => this.playAnimation());
        }
        
        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => this.pauseAnimation());
        }
        
        // Color controls
        const addColorBtn = document.getElementById('addColorBtn');
        if (addColorBtn) {
            addColorBtn.addEventListener('click', () => this.ui.addColorFromInput());
        }
        
        const deleteColorBtn = document.getElementById('deleteColorBtn');
        if (deleteColorBtn) {
            deleteColorBtn.addEventListener('click', () => {
                this.ui.deleteColor(this.state.currentColor);
            });
        }
        
        if (this.ui.elements.colorPicker) {
            this.ui.elements.colorPicker.addEventListener('input', (e) => {
                if (this.ui.elements.colorInput) {
                    this.ui.elements.colorInput.value = e.target.value;
                }
            });
        }
        
        if (this.ui.elements.colorInput) {
            this.ui.elements.colorInput.addEventListener('change', (e) => {
                if (this.ui.elements.colorPicker) {
                    this.ui.elements.colorPicker.value = e.target.value;
                }
            });
        }
        
        // File operations
        const importPNGBtn = document.getElementById('importPNGBtn');
        if (importPNGBtn) {
            importPNGBtn.addEventListener('click', () => {
                if (this.ui.elements.importFile) {
                    this.ui.elements.importFile.click();
                }
            });
        }
        
        if (this.ui.elements.importFile) {
            this.ui.elements.importFile.addEventListener('change', (e) => {
                if (e.target.files[0]) {
                    this.importPNG(e.target.files[0]);
                }
            });
        }
        
        const exportPNGBtn = document.getElementById('exportPNGBtn');
        if (exportPNGBtn) {
            exportPNGBtn.addEventListener('click', () => this.fileOps.exportPNG());
        }
        
        const exportJSONBtn = document.getElementById('exportJSONBtn');
        if (exportJSONBtn) {
            exportJSONBtn.addEventListener('click', () => this.fileOps.exportJSON());
        }
        
        // Display options
        if (this.ui.elements.toggleGridBtn) {
            this.ui.elements.toggleGridBtn.addEventListener('click', () => this.ui.toggleGrid());
        }
        
        if (this.ui.elements.toggleCheckerboardBtn) {
            this.ui.elements.toggleCheckerboardBtn.addEventListener('click', () => this.ui.toggleCheckerboard());
        }
        
        console.log('Event listeners setup complete');
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
            
            // Update UI
            this.ui.updateColorPalette();
            this.ui.updateFrameThumbnails();
            this.ui.drawFrame();
            
        } catch (error) {
            console.error('PNG import error:', error);
            this.ui.showAlert(error.message, 'error');
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing Sprite Editor...');
    try {
        window.spriteEditor = new SpriteEditorApp();
        console.log('Sprite Editor initialized successfully');
    } catch (error) {
        console.error('Failed to initialize Sprite Editor:', error);
        alert('Failed to initialize Sprite Editor. Please check the console for errors.');
    }
});