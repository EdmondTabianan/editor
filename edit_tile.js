// === Settings ===
const OriginalTileSize = 16;
const EditorScale = 20;

// === Default Palette ===
let paletteColors = ["#FFF1D6", "#F2C97D", "#E0A84F", "#C68642", "#7A4A1E", 
                     "#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF"];

// === Tile Editor Variables ===
let currentTile = [];
let selectedColor = 0;
let isDragging = false;
let brushSize = 1; // 1x1, 2x2, 3x3, etc.

// === Canvas Setup ===
const tileEditorCanvas = document.getElementById('tileEditor');
let tileEditorCtx;

// Initialize tile editor canvas
function initTileEditorCanvas() {
  tileEditorCanvas.width = OriginalTileSize * EditorScale;
  tileEditorCanvas.height = OriginalTileSize * EditorScale;
  tileEditorCtx = tileEditorCanvas.getContext('2d');
  tileEditorCtx.imageSmoothingEnabled = false;
}

// === Initialize Current Tile ===
function initializeTile() {
  currentTile = [];
  for (let y = 0; y < OriginalTileSize; y++) {
    currentTile[y] = [];
    for (let x = 0; x < OriginalTileSize; x++) {
      currentTile[y][x] = 0; // Default to first color
    }
  }
  drawTileEditor();
}

// === Tile Editor Functions ===
function drawTileEditor() {
  if (!tileEditorCtx) return;
  
  // Clear canvas
  tileEditorCtx.clearRect(0, 0, tileEditorCanvas.width, tileEditorCanvas.height);
  
  // Draw grid
  tileEditorCtx.strokeStyle = '#666';
  tileEditorCtx.lineWidth = 1;
  
  // Draw vertical lines
  for (let x = 0; x <= OriginalTileSize; x++) {
    tileEditorCtx.beginPath();
    tileEditorCtx.moveTo(x * EditorScale, 0);
    tileEditorCtx.lineTo(x * EditorScale, OriginalTileSize * EditorScale);
    tileEditorCtx.stroke();
  }
  
  // Draw horizontal lines
  for (let y = 0; y <= OriginalTileSize; y++) {
    tileEditorCtx.beginPath();
    tileEditorCtx.moveTo(0, y * EditorScale);
    tileEditorCtx.lineTo(OriginalTileSize * EditorScale, y * EditorScale);
    tileEditorCtx.stroke();
  }
  
  // Draw pixels
  for (let y = 0; y < OriginalTileSize; y++) {
    for (let x = 0; x < OriginalTileSize; x++) {
      const colorIndex = currentTile[y][x];
      if (colorIndex >= 0 && colorIndex < paletteColors.length) {
        tileEditorCtx.fillStyle = paletteColors[colorIndex];
        tileEditorCtx.fillRect(
          x * EditorScale + 1, 
          y * EditorScale + 1, 
          EditorScale - 2, 
          EditorScale - 2
        );
      }
    }
  }
  
  // Draw brush preview if mouse is over canvas
  if (lastMouseX !== -1 && lastMouseY !== -1) {
    const gridX = Math.floor(lastMouseX / EditorScale);
    const gridY = Math.floor(lastMouseY / EditorScale);
    
    if (gridX >= 0 && gridX < OriginalTileSize && gridY >= 0 && gridY < OriginalTileSize) {
      tileEditorCtx.strokeStyle = '#FFF';
      tileEditorCtx.lineWidth = 2;
      tileEditorCtx.setLineDash([3, 3]);
      
      for (let dy = 0; dy < brushSize; dy++) {
        for (let dx = 0; dx < brushSize; dx++) {
          const px = gridX + dx;
          const py = gridY + dy;
          
          if (px < OriginalTileSize && py < OriginalTileSize) {
            tileEditorCtx.strokeRect(
              px * EditorScale + 1,
              py * EditorScale + 1,
              EditorScale - 2,
              EditorScale - 2
            );
          }
        }
      }
      
      tileEditorCtx.setLineDash([]);
    }
  }
}

// === Color Palette Functions ===
function initColorPalette() {
  const colorPaletteDiv = document.getElementById('colorPalette');
  colorPaletteDiv.innerHTML = '';
  
  paletteColors.forEach((color, idx) => {
    const swatchContainer = document.createElement('div');
    swatchContainer.className = 'color-swatch-container';
    swatchContainer.style.position = 'relative';
    
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.background = color;
    swatch.style.border = idx === selectedColor ? '3px solid #FFF' : '1px solid #666';
    swatch.style.boxShadow = idx === selectedColor ? '0 0 0 2px #63b3ed' : 'none';
    swatch.title = `${color} (${idx})`;
    
    // Color index label
    const indexLabel = document.createElement('div');
    indexLabel.className = 'color-index';
    indexLabel.textContent = idx;
    indexLabel.style.position = 'absolute';
    indexLabel.style.top = '2px';
    indexLabel.style.left = '2px';
    indexLabel.style.background = 'rgba(0,0,0,0.7)';
    indexLabel.style.color = '#FFF';
    indexLabel.style.fontSize = '10px';
    indexLabel.style.padding = '1px 3px';
    indexLabel.style.borderRadius = '2px';
    indexLabel.style.pointerEvents = 'none';
    
    // Delete button for custom colors (not default ones)
    if (idx >= 5) { // Custom colors start at index 5
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '×';
      deleteBtn.className = 'color-delete-btn';
      deleteBtn.style.position = 'absolute';
      deleteBtn.style.top = '-5px';
      deleteBtn.style.right = '-5px';
      deleteBtn.style.background = '#e53e3e';
      deleteBtn.style.color = 'white';
      deleteBtn.style.border = 'none';
      deleteBtn.style.borderRadius = '50%';
      deleteBtn.style.width = '16px';
      deleteBtn.style.height = '16px';
      deleteBtn.style.fontSize = '12px';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.display = 'none';
      
      swatchContainer.addEventListener('mouseenter', () => {
        deleteBtn.style.display = 'block';
      });
      
      swatchContainer.addEventListener('mouseleave', () => {
        deleteBtn.style.display = 'none';
      });
      
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete this color?')) {
          paletteColors.splice(idx, 1);
          // Update all tiles that used this color
          for (let y = 0; y < OriginalTileSize; y++) {
            for (let x = 0; x < OriginalTileSize; x++) {
              if (currentTile[y][x] === idx) {
                currentTile[y][x] = 0; // Reset to default color
              } else if (currentTile[y][x] > idx) {
                currentTile[y][x]--; // Shift colors down
              }
            }
          }
          if (selectedColor >= idx) {
            selectedColor = Math.max(0, selectedColor - 1);
          }
          initColorPalette();
          drawTileEditor();
        }
      });
      
      swatchContainer.appendChild(deleteBtn);
    }
    
    swatch.addEventListener('click', () => {
      selectedColor = idx;
      updateSelectedColorDisplay();
      initColorPalette();
    });
    
    swatchContainer.appendChild(swatch);
    swatchContainer.appendChild(indexLabel);
    colorPaletteDiv.appendChild(swatchContainer);
  });
  
  updateSelectedColorDisplay();
}

function updateSelectedColorDisplay() {
  const selectedColorDiv = document.getElementById('selectedColorDisplay');
  if (selectedColorDiv) {
    selectedColorDiv.textContent = `Selected: ${selectedColor} - ${paletteColors[selectedColor]}`;
    selectedColorDiv.style.background = paletteColors[selectedColor];
    selectedColorDiv.style.color = getContrastColor(paletteColors[selectedColor]);
  }
}

function getContrastColor(hexColor) {
  // Convert hex to RGB
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return black or white based on luminance
  return luminance > 0.5 ? '#000' : '#FFF';
}

// === Add New Color ===
function addNewColor(hexColor) {
  // Validate hex color
  if (!/^#[0-9A-F]{6}$/i.test(hexColor)) {
    alert('Please enter a valid hex color (e.g., #FF0000)');
    return false;
  }
  
  // Convert to uppercase for consistency
  hexColor = hexColor.toUpperCase();
  
  // Check if color already exists
  if (paletteColors.includes(hexColor)) {
    alert('This color is already in the palette!');
    // Select the existing color
    selectedColor = paletteColors.indexOf(hexColor);
    initColorPalette();
    return false;
  }
  
  // Add to palette
  paletteColors.push(hexColor);
  selectedColor = paletteColors.length - 1;
  initColorPalette();
  return true;
}

// === Brush Functions ===
function setBrushSize(size) {
  brushSize = Math.max(1, Math.min(OriginalTileSize, size));
  updateBrushSizeDisplay();
}

function updateBrushSizeDisplay() {
  const brushSizeDisplay = document.getElementById('brushSizeDisplay');
  if (brushSizeDisplay) {
    brushSizeDisplay.textContent = `Brush: ${brushSize}×${brushSize}`;
  }
}

// === Drawing Functions ===
let lastMouseX = -1;
let lastMouseY = -1;

function paintAtPosition(x, y) {
  const gridX = Math.floor(x / EditorScale);
  const gridY = Math.floor(y / EditorScale);
  
  if (gridX >= 0 && gridX < OriginalTileSize && gridY >= 0 && gridY < OriginalTileSize) {
    // Paint with brush size
    for (let dy = 0; dy < brushSize; dy++) {
      for (let dx = 0; dx < brushSize; dx++) {
        const px = gridX + dx;
        const py = gridY + dy;
        
        if (px < OriginalTileSize && py < OriginalTileSize) {
          currentTile[py][px] = selectedColor;
        }
      }
    }
    drawTileEditor();
  }
}

// === File Export Functions ===
function saveTileAsPNG() {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = OriginalTileSize;
  tempCanvas.height = OriginalTileSize;
  const tempCtx = tempCanvas.getContext('2d');
  
  // Fill with transparency first
  tempCtx.clearRect(0, 0, OriginalTileSize, OriginalTileSize);
  
  for (let y = 0; y < OriginalTileSize; y++) {
    for (let x = 0; x < OriginalTileSize; x++) {
      const colorIndex = currentTile[y][x];
      if (colorIndex >= 0 && colorIndex < paletteColors.length) {
        tempCtx.fillStyle = paletteColors[colorIndex];
        tempCtx.fillRect(x, y, 1, 1);
      }
    }
  }
  
  const link = document.createElement('a');
  link.href = tempCanvas.toDataURL('image/png');
  link.download = `tile_${Date.now()}.png`;
  link.click();
}

function saveTileAsJSON() {
  const tileData = {
    palette: paletteColors,
    pixels: currentTile,
    size: OriginalTileSize,
    exported: new Date().toISOString()
  };
  
  const jsonStr = JSON.stringify(tileData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `tile_${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function loadTileFromJSON(jsonData) {
  try {
    const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    
    if (data.palette && data.pixels && data.size === OriginalTileSize) {
      paletteColors = data.palette;
      currentTile = data.pixels;
      selectedColor = 0;
      initColorPalette();
      drawTileEditor();
      alert('Tile loaded successfully!');
      return true;
    }
  } catch (error) {
    console.error('Error loading JSON:', error);
  }
  return false;
}

// === Event Listeners ===
function initEventListeners() {
  // Tile Editor Mouse Events
  tileEditorCanvas.addEventListener('mousedown', (e) => {
    const rect = tileEditorCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    paintAtPosition(x, y);
    isDragging = true;
  });
  
  tileEditorCanvas.addEventListener('mousemove', (e) => {
    const rect = tileEditorCanvas.getBoundingClientRect();
    lastMouseX = e.clientX - rect.left;
    lastMouseY = e.clientY - rect.top;
    
    if (isDragging) {
      paintAtPosition(lastMouseX, lastMouseY);
    }
    
    drawTileEditor(); // Redraw to show brush preview
  });
  
  tileEditorCanvas.addEventListener('mouseup', () => {
    isDragging = false;
  });
  
  tileEditorCanvas.addEventListener('mouseleave', () => {
    isDragging = false;
    lastMouseX = -1;
    lastMouseY = -1;
    drawTileEditor();
  });

  // Button Event Listeners
  document.getElementById('newTileBtn').addEventListener('click', () => {
    initializeTile();
  });

  document.getElementById('clearTileBtn').addEventListener('click', () => {
    if (confirm('Clear the current tile?')) {
      initializeTile();
    }
  });

  document.getElementById('saveTilePNGBtn').addEventListener('click', saveTileAsPNG);
  
  document.getElementById('saveTileJSONBtn').addEventListener('click', saveTileAsJSON);
  
  document.getElementById('loadTileJSONBtn').addEventListener('click', () => {
    document.getElementById('importTileJSON').click();
  });

  // Import PNG to Tile Editor
  document.getElementById('importTilePNG').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = new Image();
      img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = OriginalTileSize;
        tempCanvas.height = OriginalTileSize;
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCtx.drawImage(img, 0, 0, OriginalTileSize, OriginalTileSize);
        
        const imgData = tempCtx.getImageData(0, 0, OriginalTileSize, OriginalTileSize).data;
        
        // Extract unique colors from image
        const uniqueColors = new Set();
        const colorMap = new Map();
        
        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];
          
          if (a > 0) { // Ignore transparent pixels
            const hex = rgbToHex(r, g, b);
            uniqueColors.add(hex);
          }
        }
        
        // Add new colors to palette if needed
        const newColors = Array.from(uniqueColors).filter(color => !paletteColors.includes(color));
        if (newColors.length > 0) {
          paletteColors.push(...newColors);
        }
        
        // Convert image to tile data
        for (let y = 0; y < OriginalTileSize; y++) {
          currentTile[y] = [];
          for (let x = 0; x < OriginalTileSize; x++) {
            const index = (y * OriginalTileSize + x) * 4;
            const r = imgData[index];
            const g = imgData[index + 1];
            const b = imgData[index + 2];
            const a = imgData[index + 3];
            
            if (a === 0) {
              currentTile[y][x] = 0; // Transparent becomes first color
            } else {
              const hex = rgbToHex(r, g, b);
              currentTile[y][x] = paletteColors.indexOf(hex);
            }
          }
        }
        
        initColorPalette();
        drawTileEditor();
        alert(`Tile loaded! ${newColors.length > 0 ? `Added ${newColors.length} new colors to palette.` : ''}`);
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  });
  
  // Import JSON
  document.getElementById('importTileJSON').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      loadTileFromJSON(evt.target.result);
    };
    reader.readAsText(file);
  });

  // Color Picker and Add Color
  document.getElementById('addColorBtn').addEventListener('click', () => {
    const colorInput = document.getElementById('colorInput');
    if (colorInput) {
      const hexColor = colorInput.value;
      if (addNewColor(hexColor)) {
        colorInput.value = '#000000';
      }
    }
  });
  
  // Brush Size Controls
  const brushSizeInput = document.getElementById('brushSizeInput');
  if (brushSizeInput) {
    brushSizeInput.addEventListener('input', (e) => {
      setBrushSize(parseInt(e.target.value) || 1);
    });
    brushSizeInput.value = brushSize;
  }
  
  // Quick color buttons
  const quickColors = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];
  quickColors.forEach(color => {
    const btn = document.createElement('button');
    btn.style.background = color;
    btn.style.width = '30px';
    btn.style.height = '30px';
    btn.style.border = '1px solid #666';
    btn.style.margin = '2px';
    btn.style.cursor = 'pointer';
    btn.title = color;
    btn.addEventListener('click', () => {
      addNewColor(color);
    });
    
    const quickColorsDiv = document.getElementById('quickColors');
    if (quickColorsDiv) {
      quickColorsDiv.appendChild(btn);
    }
  });
  
  // Color picker input
  const colorPicker = document.getElementById('colorPicker');
  if (colorPicker) {
    colorPicker.addEventListener('input', (e) => {
      const colorInput = document.getElementById('colorInput');
      if (colorInput) {
        colorInput.value = e.target.value;
      }
    });
  }
  
  // Fill tool
  document.getElementById('fillToolBtn').addEventListener('click', () => {
    const tool = document.getElementById('toolSelect');
    if (tool) {
      tool.value = 'fill';
      alert('Fill tool selected. Click on a pixel to fill connected area with selected color.');
    }
  });
  
  // Eye dropper tool
  document.getElementById('eyeDropperBtn').addEventListener('click', () => {
    const tool = document.getElementById('toolSelect');
    if (tool) {
      tool.value = 'eyedropper';
      alert('Eye dropper selected. Click on a pixel to select its color.');
    }
  });
}

// === Utility Functions ===
function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

// === Initialize Everything ===
function initApp() {
  initTileEditorCanvas();
  initColorPalette();
  initializeTile();
  initEventListeners();
  drawTileEditor();
  updateBrushSizeDisplay();
  updateSelectedColorDisplay();
}

// Start the app when page loads
window.addEventListener('load', initApp);

// Handle window resize
window.addEventListener('resize', () => {
  drawTileEditor();
});