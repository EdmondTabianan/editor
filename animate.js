// animate.js - Main application file
import { SpriteEditorState } from './sprite-editor-state.js';
import { SpriteEditorUI } from './sprite-editor-ui.js';
import { SpriteEditorFileOps } from './sprite-editor-file-ops.js';
import $ from './edit_map/jquery.js'; // Import jQuery as ES6 module

// Import constants if needed
import { CANVAS_SCALE, PIXEL_SIZE, MAX_COLORS } from './constants.js';

// Initialize the application when DOM is ready
$(document).ready(() => {
    console.log('Sprite Editor initializing...');
    
    try {
        // Initialize state
        const state = new SpriteEditorState();
        
        // Initialize UI
        const ui = new SpriteEditorUI(state);
        
        // Initialize file operations
        const fileOps = new SpriteEditorFileOps(state, ui);
        
        // Set up all event listeners using jQuery
        setupEventListeners(state, ui, fileOps);
        
        // Initial UI updates
        ui.drawFrame();
        ui.updateFrameThumbnails();
        ui.updateColorPalette();
        ui.updateStatusBar();
        
        console.log('Sprite Editor initialized successfully');
        
        // Expose for debugging
        window.spriteEditor = { state, ui, fileOps };
        
    } catch (error) {
        console.error('Failed to initialize Sprite Editor:', error);
        alert(`Failed to initialize: ${error.message}`);
    }
});

function setupEventListeners(state, ui, fileOps) {
    console.log('Setting up event listeners...');
    
    // Tool buttons
    $('.tool-btn').on('click', function() {
        const tool = $(this).data('tool');
        if (tool) {
            $('.tool-btn').removeClass('active');
            $(this).addClass('active');
            state.currentTool = tool;
            ui.updateStatusBar();
        }
    });
    
    // Brush size control
    $('#brushSize').on('input', function() {
        state.brushSize = parseInt($(this).val());
        $('#brushSizeDisplay').text(`${state.brushSize}×${state.brushSize}`);
        ui.updateStatusBar();
    });
    
    // Color picker
    $('#colorPicker').on('input', function() {
        const color = $(this).val();
        $('#colorInput').val(color);
        try {
            // Find or add color
            const index = state.palette.indexOf(color);
            if (index !== -1) {
                state.currentColor = index;
            } else {
                state.addColor(color);
                state.currentColor = state.palette.length - 1;
            }
            ui.updateColorPalette();
            ui.updateStatusBar();
        } catch (error) {
            ui.showAlert(error.message, 'error');
        }
    });
    
    // Color input
    $('#colorInput').on('change', function() {
        const color = $(this).val();
        if (/^#[0-9A-F]{6}$/i.test(color)) {
            $('#colorPicker').val(color);
            $('#colorPicker').trigger('input');
        } else {
            ui.showAlert('Invalid color format. Use #RRGGBB', 'error');
        }
    });
    
    // Add color button
    $('#addColorBtn').on('click', () => {
        ui.addColorFromInput();
    });
    
    // Delete color button
    $('#deleteColorBtn').on('click', () => {
        if (state.currentColor > 1) { // Don't delete transparent (0) or default black (1)
            ui.deleteColor(state.currentColor);
        } else {
            ui.showAlert('Cannot delete default colors', 'error');
        }
    });
    
    // Canvas size buttons
    $('.size-btn').on('click', function() {
        const newSize = parseInt($(this).data('size'));
        if (ui.changeCanvasSize(newSize)) {
            $('.size-btn').removeClass('active');
            $(this).addClass('active');
        }
    });
    
    // Frame management buttons
    $('#addFrameBtn').on('click', () => {
        state.addFrame();
        ui.drawFrame();
        ui.updateFrameThumbnails();
        ui.updateStatusBar();
        state.saveToLocalStorage();
    });
    
    $('#duplicateFrameBtn').on('click', () => {
        state.duplicateFrame();
        ui.drawFrame();
        ui.updateFrameThumbnails();
        ui.updateStatusBar();
        state.saveToLocalStorage();
    });
    
    $('#deleteFrameBtn').on('click', () => {
        if (state.frames.length > 1) {
            if (confirm('Delete current frame?')) {
                state.deleteFrame();
                ui.drawFrame();
                ui.updateFrameThumbnails();
                ui.updateStatusBar();
                state.saveToLocalStorage();
            }
        } else {
            ui.showAlert('Cannot delete the last frame', 'error');
        }
    });
    
    $('#prevFrameBtn').on('click', () => {
        state.prevFrame();
        ui.drawFrame();
        ui.updateFrameThumbnails();
        ui.updateStatusBar();
    });
    
    $('#nextFrameBtn').on('click', () => {
        state.nextFrame();
        ui.drawFrame();
        ui.updateFrameThumbnails();
        ui.updateStatusBar();
    });
    
    // Grid and checkerboard toggles
    $('#toggleGridBtn').on('click', () => {
        ui.toggleGrid();
    });
    
    $('#toggleCheckerboardBtn').on('click', () => {
        ui.toggleCheckerboard();
    });
    
    // Animation controls
    $('#playBtn').on('click', () => {
        if (!state.isPlaying) {
            const speed = parseInt($('#animationSpeed').val());
            state.playAnimation(speed);
            $('#playBtn').prop('disabled', true);
            $('#pauseBtn').prop('disabled', false);
            ui.updateStatusBar();
        }
    });
    
    $('#pauseBtn').on('click', () => {
        state.pauseAnimation();
        $('#playBtn').prop('disabled', false);
        $('#pauseBtn').prop('disabled', true);
        ui.updateStatusBar();
    });
    
    $('#animationSpeed').on('change', function() {
        if (state.isPlaying) {
            const speed = parseInt($(this).val());
            state.pauseAnimation();
            state.playAnimation(speed);
        }
    });
    
    // Menu event handlers
    setupMenuHandlers(state, ui, fileOps);
    
    // Canvas mouse events
    setupCanvasEvents(state, ui);
    
    console.log('Event listeners setup complete');
}

function setupMenuHandlers(state, ui, fileOps) {
    // File menu
    $('#menuNew').on('click', () => {
        if (confirm('Start new project? Unsaved changes will be lost.')) {
            state.clearProject();
            ui.drawFrame();
            ui.updateFrameThumbnails();
            ui.updateColorPalette();
            ui.updateStatusBar();
        }
    });
    
    $('#menuOpen').on('click', () => {
        $('#importFile').trigger('click');
    });
    
    $('#menuSave').on('click', () => {
        fileOps.exportJSON();
    });
    
    $('#menuSaveAs').on('click', () => {
        fileOps.exportJSON();
    });
    
    $('#menuImport').on('click', () => {
        $('#importFile').trigger('click');
    });
    
    $('#menuExportPNG').on('click', () => {
        fileOps.exportPNG();
    });
    
    $('#menuExportJSON').on('click', () => {
        fileOps.exportJSON();
    });
    
    // Edit menu
    $('#menuClear').on('click', () => {
        if (confirm('Clear current frame?')) {
            state.clearCurrentFrame();
            ui.drawFrame();
            ui.updateFrameThumbnails();
        }
    });
    
    // View menu
    $('#menuToggleGrid').on('click', () => {
        ui.toggleGrid();
    });
    
    $('#menuToggleCheckerboard').on('click', () => {
        ui.toggleCheckerboard();
    });
    
    // Frame menu
    $('#menuAddFrame').on('click', () => {
        state.addFrame();
        ui.drawFrame();
        ui.updateFrameThumbnails();
        ui.updateStatusBar();
    });
    
    $('#menuDuplicateFrame').on('click', () => {
        state.duplicateFrame();
        ui.drawFrame();
        ui.updateFrameThumbnails();
        ui.updateStatusBar();
    });
    
    $('#menuDeleteFrame').on('click', () => {
        if (state.frames.length > 1) {
            if (confirm('Delete current frame?')) {
                state.deleteFrame();
                ui.drawFrame();
                ui.updateFrameThumbnails();
                ui.updateStatusBar();
            }
        } else {
            ui.showAlert('Cannot delete the last frame', 'error');
        }
    });
    
    // File import handling
    $('#importFile').on('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                if (file.name.endsWith('.json')) {
                    await fileOps.importJSON(file);
                } else if (file.name.endsWith('.png')) {
                    await fileOps.importPNG(file);
                } else {
                    ui.showAlert('Unsupported file format', 'error');
                    return;
                }
                
                ui.drawFrame();
                ui.updateFrameThumbnails();
                ui.updateColorPalette();
                ui.updateStatusBar();
                ui.showAlert('File imported successfully', 'success');
                
            } catch (error) {
                ui.showAlert(error.message, 'error');
            } finally {
                // Reset file input
                e.target.value = '';
            }
        }
    });
}

function setupCanvasEvents(state, ui) {
    const canvas = ui.elements.mainCanvas;
    if (!canvas) return;
    
    let isDrawing = false;
    let lastX = -1;
    let lastY = -1;
    
    // Get canvas position relative to viewport
    function getCanvasCoordinates(e) {
        const rect = canvas.getBoundingClientRect();
        const scale = CANVAS_SCALE;
        const x = Math.floor((e.clientX - rect.left) / scale);
        const y = Math.floor((e.clientY - rect.top) / scale);
        return { x, y };
    }
    
    // Update mouse position display
    canvas.addEventListener('mousemove', (e) => {
        const { x, y } = getCanvasCoordinates(e);
        if (ui.elements.mousePos) {
            ui.elements.mousePos.textContent = `X:${x}, Y:${y}`;
        }
        
        // Handle drawing
        if (isDrawing) {
            drawPixel(x, y, true);
        }
    });
    
    canvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        const { x, y } = getCanvasCoordinates(e);
        drawPixel(x, y, false);
    });
    
    canvas.addEventListener('mouseup', () => {
        isDrawing = false;
        lastX = -1;
        lastY = -1;
        state.saveToLocalStorage();
    });
    
    canvas.addEventListener('mouseleave', () => {
        isDrawing = false;
        lastX = -1;
        lastY = -1;
    });
    
    function drawPixel(x, y, isDragging) {
        // Check bounds
        if (x < 0 || x >= state.canvasWidth || y < 0 || y >= state.canvasHeight) {
            return;
        }
        
        const frame = state.frames[state.currentFrame];
        
        switch (state.currentTool) {
            case 'brush':
                drawBrush(x, y, isDragging, frame);
                break;
            case 'eraser':
                frame[y][x] = 0; // Transparent
                break;
            case 'eyedropper':
                const colorIndex = frame[y][x];
                if (colorIndex !== 0 && colorIndex < state.palette.length) {
                    state.currentColor = colorIndex;
                    ui.updateColorPalette();
                    ui.updateStatusBar();
                    $('#colorPicker').val(state.palette[colorIndex]);
                    $('#colorInput').val(state.palette[colorIndex]);
                }
                return; // Don't redraw for eyedropper
            case 'fill':
                // Simple flood fill implementation
                const targetColor = frame[y][x];
                if (targetColor !== state.currentColor) {
                    floodFill(x, y, targetColor, state.currentColor, frame);
                }
                break;
        }
        
        ui.drawFrame();
        lastX = x;
        lastY = y;
    }
    
    function drawBrush(x, y, isDragging, frame) {
        const brushSize = state.brushSize;
        const halfSize = Math.floor(brushSize / 2);
        
        for (let dy = -halfSize; dy <= halfSize; dy++) {
            for (let dx = -halfSize; dx <= halfSize; dx++) {
                const px = x + dx;
                const py = y + dy;
                
                if (px >= 0 && px < state.canvasWidth && py >= 0 && py < state.canvasHeight) {
                    // For line drawing during drag
                    if (isDragging && lastX >= 0 && lastY >= 0 && 
                        (state.currentTool === 'brush' || state.currentTool === 'eraser')) {
                        drawLine(lastX, lastY, x, y, frame);
                    } else {
                        frame[py][px] = state.currentColor;
                    }
                }
            }
        }
    }
    
    function drawLine(x1, y1, x2, y2, frame) {
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const sx = (x1 < x2) ? 1 : -1;
        const sy = (y1 < y2) ? 1 : -1;
        let err = dx - dy;
        
        while (true) {
            drawBrush(x1, y1, false, frame);
            
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
    
    function floodFill(x, y, targetColor, newColor, frame) {
        if (targetColor === newColor) return;
        
        const stack = [[x, y]];
        const visited = new Set();
        
        while (stack.length > 0) {
            const [cx, cy] = stack.pop();
            const key = `${cx},${cy}`;
            
            if (visited.has(key)) continue;
            if (cx < 0 || cx >= state.canvasWidth || cy < 0 || cy >= state.canvasHeight) continue;
            if (frame[cy][cx] !== targetColor) continue;
            
            frame[cy][cx] = newColor;
            visited.add(key);
            
            stack.push([cx + 1, cy]);
            stack.push([cx - 1, cy]);
            stack.push([cx, cy + 1]);
            stack.push([cx, cy - 1]);
        }
    }
}