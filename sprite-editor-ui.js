import { SpriteEditorState, PIXEL_SIZE, CANVAS_SCALE, CANVAS_SIZE } from './sprite-editor-state.js';

export class SpriteEditorUI {
    constructor(state) {
        this.state = state;
        this.isDrawing = false;
        this.lastMouseX = -1;
        this.lastMouseY = -1;
        this.startX = -1;
        this.startY = -1;
        
        // DOM Elements
        this.mainCanvas = document.getElementById('mainCanvas');
        this.ctx = this.mainCanvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;
        
        this.initElements();
    }

    initElements() {
        // Canvas
        this.mainCanvas.width = CANVAS_SIZE;
        this.mainCanvas.height = CANVAS_SIZE;
        
        // UI Elements - with null checks
        this.elements = {
            frameIndex: document.getElementById('frameIndex'),
            frameCount: document.getElementById('frameCount'),
            currentTool: document.getElementById('currentTool'),
            currentColor: document.getElementById('currentColor'),
            mousePos: document.getElementById('mousePos'),
            brushSizeDisplay: document.getElementById('brushSizeDisplay'),
            frameThumbnails: document.getElementById('frameThumbnails'),
            colorPalette: document.getElementById('colorPalette'),
            colorInput: document.getElementById('colorInput'),
            colorPicker: document.getElementById('colorPicker'),
            brushSize: document.getElementById('brushSize'),
            animationSpeed: document.getElementById('animationSpeed'),
            importFile: document.getElementById('importFile'),
            toggleGridBtn: document.getElementById('toggleGridBtn'),
            toggleCheckerboardBtn: document.getElementById('toggleCheckerboardBtn')
        };

        // Log missing elements for debugging
        Object.entries(this.elements).forEach(([key, element]) => {
            if (!element) {
                console.warn(`UI element not found: ${key}`);
            }
        });
    }

    drawFrame() {
        console.log('Drawing frame:', this.state.currentFrame);
        
        // Clear canvas
        if (this.state.showCheckerboard) {
            this.drawCheckerboard();
        } else {
            this.ctx.fillStyle = '#222';
            this.ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        }
        
        // Draw grid if enabled
        if (this.state.showGrid) {
            this.ctx.strokeStyle = '#444';
            this.ctx.lineWidth = 1;
            
            for (let x = 0; x <= PIXEL_SIZE; x++) {
                this.ctx.beginPath();
                this.ctx.moveTo(x * CANVAS_SCALE, 0);
                this.ctx.lineTo(x * CANVAS_SCALE, CANVAS_SIZE);
                this.ctx.stroke();
            }
            
            for (let y = 0; y <= PIXEL_SIZE; y++) {
                this.ctx.beginPath();
                this.ctx.moveTo(0, y * CANVAS_SCALE);
                this.ctx.lineTo(CANVAS_SIZE, y * CANVAS_SCALE);
                this.ctx.stroke();
            }
        }
        
        // Draw pixels
        const frame = this.state.frames[this.state.currentFrame];
        for (let y = 0; y < PIXEL_SIZE; y++) {
            for (let x = 0; x < PIXEL_SIZE; x++) {
                const colorIndex = frame[y][x];
                if (colorIndex > 0) { // Only draw non-transparent pixels
                    const color = this.state.palette[colorIndex];
                    if (color) {
                        this.ctx.fillStyle = color;
                        this.ctx.fillRect(
                            x * CANVAS_SCALE + 1,
                            y * CANVAS_SCALE + 1,
                            CANVAS_SCALE - 2,
                            CANVAS_SCALE - 2
                        );
                    }
                }
            }
        }
        
        this.updateStatusBar();
    }

    drawCheckerboard() {
        const checkerSize = CANVAS_SCALE / 2;
        const lightColor = '#222';
        const darkColor = '#2a2a2a';
        
        for (let y = 0; y < CANVAS_SIZE; y += checkerSize) {
            for (let x = 0; x < CANVAS_SIZE; x += checkerSize) {
                const isDark = Math.floor(x / checkerSize) % 2 === Math.floor(y / checkerSize) % 2;
                this.ctx.fillStyle = isDark ? darkColor : lightColor;
                this.ctx.fillRect(x, y, checkerSize, checkerSize);
            }
        }
    }

    drawFrameThumbnail(frameIndex, canvas) {
        const ctx = canvas.getContext('2d');
        const frame = this.state.frames[frameIndex];
        const scale = canvas.width / PIXEL_SIZE;
        const checkerSize = scale / 2;
        
        // Draw checkerboard background
        const lightColor = '#222';
        const darkColor = '#2a2a2a';
        
        for (let y = 0; y < canvas.height; y += checkerSize) {
            for (let x = 0; x < canvas.width; x += checkerSize) {
                const isDark = Math.floor(x / checkerSize) % 2 === Math.floor(y / checkerSize) % 2;
                ctx.fillStyle = isDark ? darkColor : lightColor;
                ctx.fillRect(x, y, checkerSize, checkerSize);
            }
        }
        
        // Draw pixels (skip transparent pixels)
        for (let y = 0; y < PIXEL_SIZE; y++) {
            for (let x = 0; x < PIXEL_SIZE; x++) {
                const colorIndex = frame[y][x];
                if (colorIndex > 0) {
                    ctx.fillStyle = this.state.palette[colorIndex];
                    ctx.fillRect(x * scale, y * scale, scale, scale);
                }
            }
        }
    }

    updateFrameThumbnails() {
        const container = this.elements.frameThumbnails;
        if (!container) {
            console.error('frameThumbnails element not found');
            return;
        }
        
        container.innerHTML = '';
        
        this.state.frames.forEach((frame, index) => {
            const thumb = document.createElement('div');
            thumb.className = `frame-thumb ${index === this.state.currentFrame ? 'active' : ''}`;
            thumb.title = `Frame ${index}`;
            
            const canvas = document.createElement('canvas');
            canvas.width = 40;
            canvas.height = 40;
            
            const number = document.createElement('div');
            number.className = 'frame-number';
            number.textContent = index;
            
            thumb.appendChild(canvas);
            thumb.appendChild(number);
            
            thumb.addEventListener('click', () => {
                if (!this.state.isPlaying) {
                    this.state.currentFrame = index;
                    this.drawFrame();
                    this.updateFrameThumbnails();
                    this.saveState();
                }
            });
            
            container.appendChild(thumb);
            this.drawFrameThumbnail(index, canvas);
        });
    }

    updateColorPalette() {
        const container = this.elements.colorPalette;
        if (!container) {
            console.error('colorPalette element not found');
            return;
        }
        
        container.innerHTML = '';
        
        this.state.palette.forEach((color, index) => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = color;
            
            if (index === this.state.currentColor) {
                swatch.classList.add('selected');
            }
            
            const indexLabel = document.createElement('div');
            indexLabel.className = 'color-index';
            indexLabel.textContent = index;
            
            // Make text readable on dark backgrounds
            if (index === 0) { // Black color
                indexLabel.style.color = '#FFFFFF';
                indexLabel.style.textShadow = '1px 1px 2px rgba(0,0,0,0.8)';
            } else {
                indexLabel.style.color = this.getContrastColor(color);
            }
            
            swatch.appendChild(indexLabel);
            
            swatch.addEventListener('click', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    if (index >= 20) {
                        this.deleteColor(index);
                    }
                } else {
                    this.state.currentColor = index;
                    this.updateColorPalette();
                    this.updateStatusBar();
                    this.saveState();
                }
            });
            
            container.appendChild(swatch);
        });
    }
    
    // Helper function to determine text color for contrast
    getContrastColor(hexColor) {
        if (!hexColor || hexColor === 'transparent') return '#FFFFFF';
        
        // Convert hex to RGB
        const r = parseInt(hexColor.substr(1, 2), 16);
        const g = parseInt(hexColor.substr(3, 2), 16);
        const b = parseInt(hexColor.substr(5, 2), 16);
        
        // Calculate luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        // Return black or white based on luminance
        return luminance > 0.5 ? '#000000' : '#FFFFFF';
    }

    updateStatusBar() {
        // Safe updates with null checks
        if (this.elements.frameIndex) {
            this.elements.frameIndex.textContent = this.state.currentFrame;
        }
        
        if (this.elements.frameCount) {
            this.elements.frameCount.textContent = this.state.frames.length - 1;
        }
        
        if (this.elements.currentTool) {
            this.elements.currentTool.textContent = this.state.currentTool.charAt(0).toUpperCase() + this.state.currentTool.slice(1);
        }
        
        if (this.elements.currentColor) {
            this.elements.currentColor.textContent = this.state.palette[this.state.currentColor] || '#000000';
        }
        
        if (this.elements.brushSizeDisplay) {
            this.elements.brushSizeDisplay.textContent = `${this.state.brushSize}×${this.state.brushSize}`;
        }
        
        // Update tool buttons
        document.querySelectorAll('.tool-btn').forEach(btn => {
            if (btn.dataset.tool === this.state.currentTool) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    showAlert(message, type = 'info') {
        // Create or reuse alert element
        let alertDiv = document.getElementById('editor-alert');
        if (!alertDiv) {
            alertDiv = document.createElement('div');
            alertDiv.id = 'editor-alert';
            alertDiv.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                border-radius: 6px;
                color: white;
                font-weight: 600;
                z-index: 1000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                transition: opacity 0.3s;
            `;
            document.body.appendChild(alertDiv);
        }
        
        const colors = {
            info: '#4a9eff',
            success: '#2ecc71',
            error: '#e74c3c',
            warning: '#ff8800'
        };
        
        alertDiv.style.backgroundColor = colors[type] || colors.info;
        alertDiv.textContent = message;
        alertDiv.style.opacity = '1';
        
        setTimeout(() => {
            alertDiv.style.opacity = '0';
        }, 3000);
    }

    async deleteColor(index) {
        try {
            this.state.deleteColor(index);
            this.updateColorPalette();
            this.drawFrame();
            this.updateFrameThumbnails();
            this.saveState();
            this.showAlert('Color deleted successfully', 'success');
        } catch (error) {
            this.showAlert(error.message, 'error');
        }
    }

    async addColorFromInput() {
        const color = this.elements.colorInput ? this.elements.colorInput.value : '#000000';
        try {
            this.state.addColor(color);
            if (this.elements.colorPicker) {
                this.elements.colorPicker.value = color;
            }
            this.updateColorPalette();
            this.saveState();
            this.showAlert('Color added successfully', 'success');
        } catch (error) {
            this.showAlert(error.message, 'error');
        }
    }

    saveState() {
        if (this.state.saveToLocalStorage()) {
            console.log('State saved to localStorage');
        }
    }

    toggleGrid() {
        this.state.showGrid = !this.state.showGrid;
        this.drawFrame();
        this.saveState();
        const button = this.elements.toggleGridBtn;
        if (button) {
            button.textContent = this.state.showGrid ? 'Hide Grid' : 'Show Grid';
        }
        this.showAlert(`Grid ${this.state.showGrid ? 'shown' : 'hidden'}`, 'info');
    }

    toggleCheckerboard() {
        this.state.showCheckerboard = !this.state.showCheckerboard;
        this.drawFrame();
        this.saveState();
        const button = this.elements.toggleCheckerboardBtn;
        if (button) {
            button.textContent = this.state.showCheckerboard ? 'Solid Background' : 'Checkerboard';
        }
        this.showAlert(`Checkerboard ${this.state.showCheckerboard ? 'enabled' : 'disabled'}`, 'info');
    }
}