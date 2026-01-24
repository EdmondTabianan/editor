// === Settings ===
const OriginalTileSize = 16;
const MIN_TileScale = 1;
const MAX_TileScale = 8;
let TileScale = 0; // 0 means "fit to screen"
const MapCols = 50;
const MapRows = 50;
const MAX_TILES = 2000; // Maximum number of tiles (000-1999)

// === Map Editor Variables ===
let tileLibrary = [];
let selectedTileIndices = new Set();
let selectedTileIndex = 0;
const map = [];
let showGrid = true; // Grid visibility toggle

// Selection rectangle
let selectionRect = {
  startX: -1,
  startY: -1,
  endX: -1,
  endY: -1,
  isSelecting: false
};

// Editor mode: 'place' or 'select'
let editorMode = 'place';

// Canvas contexts
let mapEditorCtx;
let isFitToScreen = true;

// === UNDO/REDO SYSTEM ===
let history = [];
let historyIndex = -1;
const MAX_HISTORY = 100;
let isSavingHistory = false;

// Track changes for batch undo
let pendingChanges = [];

// Initialize empty map
for (let y = 0; y < MapRows; y++) {
  map[y] = [];
  for (let x = 0; x < MapCols; x++) {
    map[y][x] = -1;
  }
}

// Save current map state to history
function saveToHistory(action = 'Edit', batch = false) {
  if (isSavingHistory) return;
  
  // If batch mode, add to pending changes
  if (batch) {
    // Create snapshot of current map for comparison
    const snapshot = [];
    for (let y = 0; y < MapRows; y++) {
      snapshot[y] = [...map[y]];
    }
    
    // Check if this is different from last pending change
    if (pendingChanges.length === 0 || !areMapsEqual(pendingChanges[pendingChanges.length - 1], snapshot)) {
      pendingChanges.push(snapshot);
    }
    return;
  }
  
  // Finalize batch save
  if (pendingChanges.length > 0) {
    isSavingHistory = true;
    
    // Don't save if we're in the middle of history navigation
    if (historyIndex < history.length - 1) {
      history = history.slice(0, historyIndex + 1);
    }
    
    // Save the first state in the batch
    const mapCopy = [];
    for (let y = 0; y < MapRows; y++) {
      mapCopy[y] = [...pendingChanges[0]];
    }
    
    history.push({
      map: mapCopy,
      action: action,
      timestamp: new Date().toISOString(),
      batch: true,
      count: pendingChanges.length
    });
    
    // Keep history size limited
    if (history.length > MAX_HISTORY) {
      history.shift();
    }
    
    historyIndex = history.length - 1;
    pendingChanges = [];
    
    updateUndoRedoButtons();
    updateHistoryStatus();
    isSavingHistory = false;
  } else {
    // Save single action
    isSavingHistory = true;
    
    // Don't save if we're in the middle of history navigation
    if (historyIndex < history.length - 1) {
      history = history.slice(0, historyIndex + 1);
    }
    
    // Create a deep copy of the map
    const mapCopy = [];
    for (let y = 0; y < MapRows; y++) {
      mapCopy[y] = [...map[y]];
    }
    
    history.push({
      map: mapCopy,
      action: action,
      timestamp: new Date().toISOString(),
      batch: false
    });
    
    // Keep history size limited
    if (history.length > MAX_HISTORY) {
      history.shift();
    }
    
    historyIndex = history.length - 1;
    
    updateUndoRedoButtons();
    updateHistoryStatus();
    isSavingHistory = false;
  }
}

// Check if two maps are equal
function areMapsEqual(map1, map2) {
  for (let y = 0; y < MapRows; y++) {
    for (let x = 0; x < MapCols; x++) {
      if (map1[y][x] !== map2[y][x]) {
        return false;
      }
    }
  }
  return true;
}

// Undo last action
function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    const prevState = history[historyIndex];
    
    // Restore map
    for (let y = 0; y < MapRows; y++) {
      for (let x = 0; x < MapCols; x++) {
        map[y][x] = prevState.map[y][x];
      }
    }
    
    drawMap();
    updateUndoRedoButtons();
    updateHistoryStatus();
    return true;
  }
  return false;
}

// Redo last undone action
function redo() {
  if (historyIndex < history.length - 1) {
    historyIndex++;
    const nextState = history[historyIndex];
    
    // Restore map
    for (let y = 0; y < MapRows; y++) {
      for (let x = 0; x < MapCols; x++) {
        map[y][x] = nextState.map[y][x];
      }
    }
    
    drawMap();
    updateUndoRedoButtons();
    updateHistoryStatus();
    return true;
  }
  return false;
}

// Update undo/redo button states
function updateUndoRedoButtons() {
  const undoBtn = $('#undoBtn');
  const redoBtn = $('#redoBtn');
  
  if (undoBtn.length) {
    undoBtn.prop('disabled', historyIndex <= 0);
    if (historyIndex <= 0) {
      undoBtn.removeClass('available');
    } else {
      undoBtn.addClass('available');
    }
  }
  
  if (redoBtn.length) {
    redoBtn.prop('disabled', historyIndex >= history.length - 1);
  }
}

// Update history status display
function updateHistoryStatus() {
  const status = $('#historyStatus');
  if (status.length && history.length > 0) {
    status.text(`Undo: ${historyIndex}/${history.length - 1}`);
  }
}

// === Canvas Setup ===
const mapEditorCanvas = document.getElementById('mapEditor');
const mapContainer = document.getElementById('mapContainer');

// Calculate fit-to-screen zoom level
function calculateFitZoom() {
  const container = mapContainer;
  const containerWidth = container.clientWidth - 4;
  const containerHeight = container.clientHeight - 4;
  
  const maxWidthZoom = Math.floor(containerWidth / (MapCols * OriginalTileSize));
  const maxHeightZoom = Math.floor(containerHeight / (MapRows * OriginalTileSize));
  
  return Math.max(1, Math.min(maxWidthZoom, maxHeightZoom));
}

// Initialize map editor canvas
function initMapEditorCanvas() {
  let effectiveTileScale = TileScale;
  if (isFitToScreen) {
    effectiveTileScale = calculateFitZoom();
  }
  
  mapEditorCanvas.width = MapCols * OriginalTileSize * effectiveTileScale;
  mapEditorCanvas.height = MapRows * OriginalTileSize * effectiveTileScale;
  mapEditorCtx = mapEditorCanvas.getContext('2d');
  mapEditorCtx.imageSmoothingEnabled = false;
}

// Update map canvas size based on zoom
function updateMapCanvasSize() {
  let effectiveTileScale = TileScale;
  if (isFitToScreen && TileScale === 0) {
    effectiveTileScale = calculateFitZoom();
  }
  
  mapEditorCanvas.width = MapCols * OriginalTileSize * effectiveTileScale;
  mapEditorCanvas.height = MapRows * OriginalTileSize * effectiveTileScale;
  drawMap();
  updateZoomDisplay();
  updateViewInfo();
}

// Update view information
function updateViewInfo() {
  const viewInfo = $('#viewInfo');
  if (isFitToScreen) {
    const fitZoom = calculateFitZoom();
    viewInfo.text(`View: ${fitZoom}x`);
  } else {
    viewInfo.text(`View: ${TileScale}x`);
  }
}

// === Map Editor Functions ===
function drawMap() {
  if (!mapEditorCtx) return;
  
  const effectiveTileScale = isFitToScreen && TileScale === 0 ? calculateFitZoom() : TileScale;
  
  // Clear map
  mapEditorCtx.fillStyle = '#222';
  mapEditorCtx.fillRect(0, 0, mapEditorCanvas.width, mapEditorCanvas.height);
  
  // Draw grid (if enabled and zoom is at least 2x)
  if (showGrid && effectiveTileScale >= 2) {
    mapEditorCtx.strokeStyle = '#333';
    mapEditorCtx.lineWidth = 1;
    
    for (let y = 0; y <= MapRows; y++) {
      mapEditorCtx.beginPath();
      mapEditorCtx.moveTo(0, y * OriginalTileSize * effectiveTileScale);
      mapEditorCtx.lineTo(mapEditorCanvas.width, y * OriginalTileSize * effectiveTileScale);
      mapEditorCtx.stroke();
    }
    for (let x = 0; x <= MapCols; x++) {
      mapEditorCtx.beginPath();
      mapEditorCtx.moveTo(x * OriginalTileSize * effectiveTileScale, 0);
      mapEditorCtx.lineTo(x * OriginalTileSize * effectiveTileScale, mapEditorCanvas.height);
      mapEditorCtx.stroke();
    }
  }
  
  // Draw tiles
  for (let y = 0; y < MapRows; y++) {
    for (let x = 0; x < MapCols; x++) {
      const tileIndex = map[y][x];
      if (tileIndex >= 0 && tileIndex < tileLibrary.length) {
        const tileCanvas = tileLibrary[tileIndex].canvas;
        mapEditorCtx.drawImage(
          tileCanvas,
          x * OriginalTileSize * effectiveTileScale,
          y * OriginalTileSize * effectiveTileScale,
          OriginalTileSize * effectiveTileScale,
          OriginalTileSize * effectiveTileScale
        );
      }
    }
  }
  
  // Draw selection rectangle
  if (editorMode === 'select' && selectionRect.startX >= 0 && selectionRect.startY >= 0 &&
      selectionRect.endX >= 0 && selectionRect.endY >= 0) {
    const cellSize = OriginalTileSize * effectiveTileScale;
    const x1 = Math.min(selectionRect.startX, selectionRect.endX);
    const y1 = Math.min(selectionRect.startY, selectionRect.endY);
    const x2 = Math.max(selectionRect.startX, selectionRect.endX);
    const y2 = Math.max(selectionRect.startY, selectionRect.endY);
    
    mapEditorCtx.strokeStyle = '#63b3ed';
    mapEditorCtx.lineWidth = 2;
    mapEditorCtx.setLineDash([5, 3]);
    mapEditorCtx.strokeRect(
      x1 * cellSize,
      y1 * cellSize,
      (x2 - x1 + 1) * cellSize,
      (y2 - y1 + 1) * cellSize
    );
    mapEditorCtx.setLineDash([]);
    
    // Update selection info display
    const width = x2 - x1 + 1;
    const height = y2 - y1 + 1;
    $('#selectionInfo').addClass('show').text(`${width}×${height}`);
  } else {
    $('#selectionInfo').removeClass('show');
  }
}

// Toggle grid visibility
function toggleGrid() {
  showGrid = !showGrid;
  $('#gridToggleBtn').toggleClass('active', showGrid);
  drawMap();
}

// Extract number from filename for sorting
function extractTileNumber(filename) {
  const nameWithoutExt = filename.replace('.png', '').replace('.PNG', '');
  const match = nameWithoutExt.match(/\d+/);
  if (match) {
    const num = parseInt(match[0]);
    return Math.min(Math.max(num, 0), 1999);
  }
  const parsed = parseInt(nameWithoutExt);
  if (!isNaN(parsed)) {
    return Math.min(Math.max(parsed, 0), 1999);
  }
  return 0;
}

// Sort tile library by extracted numbers
function sortTileLibrary() {
  tileLibrary.sort((a, b) => {
    return extractTileNumber(a.name) - extractTileNumber(b.name);
  });
}

// Update tile count display
function updateTileCount() {
  $('#tileCountInfo').text(`Tiles: ${tileLibrary.length}/2000`);
  $('#tileStats').text(`${tileLibrary.length} tiles`);
  
  const warning = $('#tileLimitWarning');
  if (tileLibrary.length >= MAX_TILES * 0.9) {
    warning.show().css('background', '#5a2a2a');
    warning.text(`⚠️ Warning: ${tileLibrary.length}/2000 tiles`);
  } else if (tileLibrary.length >= MAX_TILES * 0.7) {
    warning.show().css('background', '#4a3a2a');
    warning.text(`${tileLibrary.length}/2000 tiles`);
  } else {
    warning.hide();
  }
}

// Update tile grid display
function updateTileGrid() {
  const tileGrid = $('#tileGrid');
  const emptyTiles = $('#emptyTiles');
  tileGrid.empty();
  
  if (tileLibrary.length === 0) {
    emptyTiles.show();
    $('#tileInfo').text('No tiles imported');
    return;
  }
  
  emptyTiles.hide();
  
  // Sort tiles before displaying
  sortTileLibrary();
  
  tileLibrary.forEach((tile, idx) => {
    const tileItem = $('<div>').addClass('tile-item');
    
    // Add selected class if this tile is selected
    if (selectedTileIndices.has(idx)) {
      if (selectedTileIndices.size > 1) {
        tileItem.addClass('multi-selected');
      } else {
        tileItem.addClass('selected');
      }
    }
    
    // Extract tile number
    const tileNumber = extractTileNumber(tile.name);
    const displayNumber = tileNumber.toString().padStart(3, '0');
    
    // Create preview canvas
    const previewCanvas = $('<canvas>').addClass('tile-preview');
    const ctx = previewCanvas[0].getContext('2d');
    previewCanvas[0].width = 64;
    previewCanvas[0].height = 64;
    
    // Draw tile preview (scaled up for visibility)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tile.canvas, 0, 0, 64, 64);
    
    // Add tile number overlay (only shows on hover)
    const numberOverlay = $('<div>').addClass('tile-number').text(displayNumber);
    
    tileItem.on('click', function(e) {
      if (e.shiftKey) {
        // SHIFT+click for multiple selection
        if (selectedTileIndices.has(idx)) {
          selectedTileIndices.delete(idx);
        } else {
          selectedTileIndices.add(idx);
        }
        if (selectedTileIndices.size > 0) {
          selectedTileIndex = Array.from(selectedTileIndices)[0];
        }
      } else {
        // Regular click for single selection
        selectedTileIndex = idx;
        selectedTileIndices.clear();
        selectedTileIndices.add(idx);
      }
      updateTileGrid();
      updateSelectedInfo();
    });
    
    tileItem.append(previewCanvas, numberOverlay);
    tileGrid.append(tileItem);
  });
  
  // Update info display
  $('#tileInfo').text(`${tileLibrary.length} tiles loaded`);
  updateTileCount();
  updateSelectedInfo();
}

function updateZoomDisplay() {
  const zoomLevel = $('#zoomLevel');
  if (isFitToScreen && TileScale === 0) {
    zoomLevel.text('Fit');
  } else {
    zoomLevel.text(`${TileScale}x`);
  }
}

function updateSelectedInfo() {
  const selectedInfo = $('#selectedInfo');
  selectedInfo.text(`Selected: ${selectedTileIndices.size}`);
}

// === Event Listeners ===
function initEventListeners() {
  // File Menu functionality
  $('#fileMenuBtn').on('click', function(e) {
    e.stopPropagation();
    $('#fileMenuContent').toggleClass('show');
  });
  
  $(document).on('click', function() {
    $('#fileMenuContent').removeClass('show');
  });
  
  $('#fileMenuContent').on('click', function(e) {
    e.stopPropagation();
  });
  
  // File menu items
  $('#menuImportTiles').on('click', function() {
    $('#importTileForMap').click();
  });
  
  $('#menuImportMap').on('click', function() {
    $('#importMapTXT').click();
  });
  
  $('#menuSaveMap').on('click', function() {
    saveMapAsTXT();
  });
  
  $('#menuExportImage').on('click', function() {
    exportMapAsPNG();
  });
  
  $('#menuClearMap').on('click', function() {
    if (confirm('Clear the entire 50x50 map?')) {
      // Save current state before clearing
      saveToHistory('Clear Map');
      
      for (let y = 0; y < MapRows; y++) {
        for (let x = 0; x < MapCols; x++) {
          map[y][x] = -1;
        }
      }
      drawMap();
    }
  });
  
  // Grid toggle button
  $('#gridToggleBtn').on('click', toggleGrid);
  
  // Import tiles button
  $('#importTilesBtn').on('click', function() {
    $('#importTileForMap').click();
  });
  
  // Deselect All button
  $('#deselectAllBtn').on('click', function() {
    selectedTileIndices.clear();
    if (tileLibrary.length > 0) {
      selectedTileIndex = 0;
      selectedTileIndices.add(0);
    }
    updateTileGrid();
  });
  
  // Undo/Redo buttons
  $('#undoBtn').on('click', function() {
    undo();
  });
  
  $('#redoBtn').on('click', function() {
    redo();
  });
  
  // Map Editor Event Listeners - FIXED VERSION with proper coordinate calculation
  let isDragging = false;
  let lastX = -1, lastY = -1;
  let mouseDownTime = 0;

  function updateCoordDisplay(x, y) {
    $('#coordDisplay').text(`X:${x} Y:${y}`);
  }

  // FIXED: Proper coordinate calculation that works with scrolling
  function getMapCoordinates(e) {
    const rect = mapEditorCanvas.getBoundingClientRect();
    
    // Get mouse position relative to viewport
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    // Calculate position relative to canvas (accounting for border)
    const canvasX = mouseX - rect.left;
    const canvasY = mouseY - rect.top;
    
    // Get the effective tile scale
    const effectiveTileScale = isFitToScreen && TileScale === 0 ? calculateFitZoom() : TileScale;
    const scaledTileSize = OriginalTileSize * effectiveTileScale;
    
    // Calculate grid coordinates
    const x = Math.floor(canvasX / scaledTileSize);
    const y = Math.floor(canvasY / scaledTileSize);
    
    return { x, y };
  }

  $(mapEditorCanvas).on('mousemove', function(e) {
    const { x, y } = getMapCoordinates(e);
    updateCoordDisplay(x, y);
    
    // Prevent going out of bounds
    const clampedX = Math.max(0, Math.min(x, MapCols - 1));
    const clampedY = Math.max(0, Math.min(y, MapRows - 1));
    
    if (isDragging && editorMode === 'place' && tileLibrary.length > 0) {
      // Only update if we moved to a different cell
      if (clampedX !== lastX || clampedY !== lastY) {
        // Check if tile actually changed
        const oldTile = map[clampedY][clampedX];
        if (oldTile !== selectedTileIndex) {
          map[clampedY][clampedX] = selectedTileIndex;
          lastX = clampedX;
          lastY = clampedY;
          drawMap();
          // Save to batch history
          saveToHistory('Paint', true);
        }
      }
    } else if (selectionRect.isSelecting && editorMode === 'select') {
      selectionRect.endX = clampedX;
      selectionRect.endY = clampedY;
      drawMap();
    }
  });

  $(mapEditorCanvas).on('mousedown', function(e) {
    const { x, y } = getMapCoordinates(e);
    
    // Prevent going out of bounds
    const clampedX = Math.max(0, Math.min(x, MapCols - 1));
    const clampedY = Math.max(0, Math.min(y, MapRows - 1));
    
    if (clampedX >= 0 && clampedX < MapCols && clampedY >= 0 && clampedY < MapRows) {
      if (editorMode === 'place' && tileLibrary.length > 0) {
        // Save state before making changes
        saveToHistory('Place Tile', true);
        
        const oldTile = map[clampedY][clampedX];
        if (oldTile !== selectedTileIndex) {
          map[clampedY][clampedX] = selectedTileIndex;
          lastX = clampedX;
          lastY = clampedY;
          isDragging = true;
          drawMap();
        }
        mouseDownTime = Date.now();
      } else if (editorMode === 'select') {
        selectionRect.startX = clampedX;
        selectionRect.startY = clampedY;
        selectionRect.endX = clampedX;
        selectionRect.endY = clampedY;
        selectionRect.isSelecting = true;
        drawMap();
      }
    }
  });

  $(mapEditorCanvas).on('mouseup', function(e) {
    if (isDragging) {
      // Finalize batch history if we were dragging
      if (pendingChanges.length > 0) {
        saveToHistory('Paint', false);
      }
    }
    isDragging = false;
    selectionRect.isSelecting = false;
    
    // Check if it was a single click (not drag)
    if (Date.now() - mouseDownTime < 200 && editorMode === 'place') {
      // Save single click action
      if (pendingChanges.length > 0) {
        saveToHistory('Place Tile', false);
      }
    }
  });

  $(mapEditorCanvas).on('mouseleave', function() {
    if (isDragging && pendingChanges.length > 0) {
      saveToHistory('Paint', false);
    }
    isDragging = false;
    selectionRect.isSelecting = false;
  });

  // Keyboard shortcuts
  $(document).on('keydown', function(e) {
    // Ctrl+Z for undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    
    // Ctrl+Y or Ctrl+Shift+Z for redo
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
    
    // Escape to deselect
    if (e.key === 'Escape') {
      selectedTileIndices.clear();
      if (tileLibrary.length > 0) {
        selectedTileIndex = 0;
        selectedTileIndices.add(0);
      }
      updateTileGrid();
    }
    
    // Delete key to clear selected tile
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (editorMode === 'place' && tileLibrary.length > 0) {
        selectedTileIndex = -1;
        selectedTileIndices.clear();
        updateTileGrid();
      }
    }
  });

  // Zoom Functions
  $('#zoomInBtn').on('click', function() {
    isFitToScreen = false;
    if (TileScale < MAX_TileScale) {
      TileScale = TileScale === 0 ? 1 : TileScale + 1;
      updateMapCanvasSize();
    }
  });

  $('#zoomOutBtn').on('click', function() {
    isFitToScreen = false;
    if (TileScale > MIN_TileScale) {
      TileScale--;
      updateMapCanvasSize();
    }
  });

  $('#zoom1xBtn').on('click', function() {
    isFitToScreen = false;
    TileScale = 1;
    updateMapCanvasSize();
  });

  $('#fitMapBtn').on('click', function() {
    isFitToScreen = true;
    TileScale = 0;
    updateMapCanvasSize();
  });

  // Import PNG for Map Editor
  $('#importTileForMap').on('change', function(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    if (tileLibrary.length + files.length > MAX_TILES) {
      alert(`Cannot import ${files.length} tiles. Maximum limit is ${MAX_TILES} tiles (000-1999).\nCurrent: ${tileLibrary.length}/${MAX_TILES}`);
      return;
    }
    
    let loadedCount = 0;
    
    files.forEach((file, fileIndex) => {
      const reader = new FileReader();
      reader.onload = function(evt) {
        const img = new Image();
        img.onload = function() {
          const tileCanvas = document.createElement('canvas');
          tileCanvas.width = OriginalTileSize;
          tileCanvas.height = OriginalTileSize;
          const tileCtx = tileCanvas.getContext('2d');
          
          tileCtx.drawImage(img, 0, 0, OriginalTileSize, OriginalTileSize);
          
          tileLibrary.push({
            image: img,
            name: file.name,
            canvas: tileCanvas
          });
          
          loadedCount++;
          
          if (loadedCount === files.length) {
            selectedTileIndices.clear();
            selectedTileIndex = tileLibrary.length - files.length;
            selectedTileIndices.add(selectedTileIndex);
            
            updateTileGrid();
            drawMap();
            
            // Save initial state to history
            if (history.length === 0) {
              saveToHistory('Initial State');
            }
            
            alert(`Added ${files.length} tile(s). Total: ${tileLibrary.length}/${MAX_TILES}`);
          }
        };
        img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
    });
  });

  // Import Map from TXT
  $('#importMapTXT').on('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (tileLibrary.length === 0) {
      alert('Please import some tiles first before loading a map!');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = function(evt) {
      const text = evt.target.result;
      const lines = text.split('\n');
      
      // Save current state before importing
      saveToHistory('Import Map');
      
      for (let y = 0; y < MapRows; y++) {
        for (let x = 0; x < MapCols; x++) {
          map[y][x] = -1;
        }
      }
      
      let readingMap = false;
      let lineIndex = 0;
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        if (trimmed === '' || trimmed.startsWith('#')) {
          continue;
        }
        
        if (!readingMap) {
          readingMap = true;
        }
        
        if (readingMap && lineIndex < MapRows) {
          const cells = trimmed.split(/\s+/);
          for (let x = 0; x < Math.min(MapCols, cells.length); x++) {
            const cell = cells[x];
            if (cell === '.' || cell === '-1') {
              map[lineIndex][x] = -1;
            } else {
              const tileIndex = parseInt(cell);
              if (!isNaN(tileIndex) && tileIndex >= 0 && tileIndex < tileLibrary.length) {
                map[lineIndex][x] = tileIndex;
              } else {
                map[lineIndex][x] = -1;
              }
            }
          }
          lineIndex++;
          if (lineIndex >= MapRows) break;
        }
      }
      
      drawMap();
      alert(`Map imported from ${file.name}`);
    };
    reader.readAsText(file);
  });

  // Editor Mode Buttons
  $('#modePlace').on('click', function() {
    editorMode = 'place';
    $('#modePlace').addClass('active');
    $('#modeSelect').removeClass('active');
    // Update canvas cursor
    mapEditorCanvas.style.cursor = 'crosshair';
    // Clear selection rectangle when switching modes
    selectionRect.startX = selectionRect.startY = selectionRect.endX = selectionRect.endY = -1;
    drawMap();
  });

  $('#modeSelect').on('click', function() {
    editorMode = 'select';
    $('#modeSelect').addClass('active');
    $('#modePlace').removeClass('active');
    // Update canvas cursor
    mapEditorCanvas.style.cursor = 'cell';
  });

  // Clear Selected Area Button
  $('#clearSelectedAreaBtn').on('click', function() {
    if (selectionRect.startX < 0 || selectionRect.startY < 0 || 
        selectionRect.endX < 0 || selectionRect.endY < 0) {
      alert('Please select an area first by clicking and dragging in Select mode.');
      return;
    }
    
    const x1 = Math.min(selectionRect.startX, selectionRect.endX);
    const y1 = Math.min(selectionRect.startY, selectionRect.endY);
    const x2 = Math.max(selectionRect.startX, selectionRect.endX);
    const y2 = Math.max(selectionRect.startY, selectionRect.endY);
    
    if (confirm(`Clear ${x2-x1+1}×${y2-y1+1} area?`)) {
      // Save state before clearing area
      saveToHistory('Clear Area');
      
      for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) {
          if (x >= 0 && x < MapCols && y >= 0 && y < MapRows) {
            map[y][x] = -1;
          }
        }
      }
      drawMap();
    }
  });

  // Initialize map info display
  $('#mapInfo').text(`Map: ${MapCols}×${MapRows}`);
  updateTileCount();
  updateSelectedInfo();
  updateUndoRedoButtons();
}

// === File Export Functions ===
function saveMapAsTXT() {
  if (tileLibrary.length === 0) {
    alert('No tiles imported yet. Please import some tiles first.');
    return;
  }
  
//   let content = `# Map exported from Map Editor\n`;
//   content += `# ${MapCols} columns × ${MapRows} rows\n`;
//   content += `# Tiles used: ${tileLibrary.length}\n`;
//   content += `# Exported: ${new Date().toLocaleString()}\n\n`;
  
  for (let y = 0; y < MapRows; y++) {
    const row = [];
    for (let x = 0; x < MapCols; x++) {
      const tileIndex = map[y][x];
      row.push(tileIndex >= 0 ? tileIndex.toString() : '.');
    }
    //content += row.join(' ') + '\n';
  }
  
//   const blob = new Blob([content], { type: 'text/plain' });
//   const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `map_${MapCols}x${MapRows}_${new Date().toISOString().slice(0,10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportMapAsPNG() {
  if (tileLibrary.length === 0) {
    alert('No tiles imported yet. Please import some tiles first.');
    return;
  }
  
  // Create a canvas for the full-resolution export (1x scale)
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = MapCols * OriginalTileSize;
  exportCanvas.height = MapRows * OriginalTileSize;
  const exportCtx = exportCanvas.getContext('2d');
  
  // Fill background
  exportCtx.fillStyle = '#222';
  exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  
  // Draw tiles at 1:1 scale
  for (let y = 0; y < MapRows; y++) {
    for (let x = 0; x < MapCols; x++) {
      const tileIndex = map[y][x];
      if (tileIndex >= 0 && tileIndex < tileLibrary.length) {
        const tileCanvas = tileLibrary[tileIndex].canvas;
        exportCtx.drawImage(
          tileCanvas,
          x * OriginalTileSize,
          y * OriginalTileSize,
          OriginalTileSize,
          OriginalTileSize
        );
      }
    }
  }
  
  // Convert to PNG and download
  exportCanvas.toBlob(function(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `map_${MapCols}x${MapRows}_${new Date().toISOString().slice(0,10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

// === Window Resize Handler ===
function handleResize() {
  if (isFitToScreen) {
    updateMapCanvasSize();
  }
}

// === Initialize Everything ===
$(document).ready(function() {
  initMapEditorCanvas();
  updateMapCanvasSize();
  initEventListeners();
  
  // Auto-select first tile if available
  if (tileLibrary.length > 0) {
    selectedTileIndex = 0;
    selectedTileIndices.add(0);
    updateTileGrid();
  }
  
  // Set initial canvas cursor
  mapEditorCanvas.style.cursor = 'crosshair';
  
  drawMap();
  
  // Save initial empty state to history
  saveToHistory('Initial State');
  
  // Handle window resize
  $(window).on('resize', handleResize);
  
  // Set initial status
  updateViewInfo();
  updateSelectedInfo();
  updateTileCount();
  updateUndoRedoButtons();
  updateHistoryStatus();
});