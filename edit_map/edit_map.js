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

// === Tile Management Variables ===
let tileImportHistory = []; // Track each import batch
let tileSets = {}; // Saved tile sets
let currentSetName = null;

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

// Track individual tile changes for per-tile undo
let pendingTileChanges = [];

// Initialize empty map
for (let y = 0; y < MapRows; y++) {
  map[y] = [];
  for (let x = 0; x < MapCols; x++) {
    map[y][x] = -1;
  }
}

// === TILE AREA DISPLAY FUNCTIONS ===
function updateTileAreaDisplay() {
  const tileGrid = document.getElementById('tileGrid');
  const importBtn = document.getElementById('importTilesBtn');
  const emptyTiles = document.getElementById('emptyTiles');
  
  if (!tileGrid || !importBtn || !emptyTiles) return;
  
  if (tileGrid.children.length > 0) {
    importBtn.style.display = 'none';
    emptyTiles.style.display = 'none';
  } else {
    importBtn.style.display = 'flex';
    emptyTiles.style.display = 'flex';
  }
  
  // Adjust grid density based on tile count
  if (tileLibrary.length > 12) {
    tileGrid.classList.add('dense');
  } else {
    tileGrid.classList.remove('dense');
  }
}

// Save current map state to history
function saveToHistory(action = 'Edit', batch = false) {
  if (isSavingHistory) return;
  
  // If batch mode, save individual tile changes
  if (batch) {
    // We'll handle batch saving differently for per-tile undo
    return;
  }
  
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

// Save individual tile change for per-tile undo
function saveTileChange(x, y, oldTile, newTile) {
  // Don't save if tile didn't actually change
  if (oldTile === newTile) return;
  
  // Add to pending changes
  pendingTileChanges.push({
    x: x,
    y: y,
    oldTile: oldTile,
    newTile: newTile,
    timestamp: Date.now()
  });
  
  // Update undo button
  updateUndoRedoButtons();
}

// Save all pending tile changes as a batch
function savePendingTileChanges() {
  if (pendingTileChanges.length === 0) return;
  
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
    action: 'Paint Tiles',
    timestamp: new Date().toISOString(),
    batch: true,
    changes: [...pendingTileChanges],
    changeCount: pendingTileChanges.length
  });
  
  // Keep history size limited
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
  
  historyIndex = history.length - 1;
  pendingTileChanges = [];
  
  updateUndoRedoButtons();
  updateHistoryStatus();
  isSavingHistory = false;
}

// Undo last action (per-tile undo)
function undo() {
  // First, check if we have pending changes
  if (pendingTileChanges.length > 0) {
    // Undo the last pending tile change
    const lastChange = pendingTileChanges.pop();
    map[lastChange.y][lastChange.x] = lastChange.oldTile;
    drawMap();
    updateUndoRedoButtons();
    return true;
  }
  
  // Otherwise, undo from history
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
  // First check if we're in the middle of painting and have undone some pending changes
  if (pendingTileChanges.length > 0 && historyIndex === history.length - 1) {
    // We can't redo while we have pending changes and are at the latest state
    return false;
  }
  
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
    // Enable undo if we have history OR pending changes
    const canUndo = historyIndex > 0 || pendingTileChanges.length > 0;
    undoBtn.prop('disabled', !canUndo);
    if (canUndo) {
      undoBtn.addClass('available');
    } else {
      undoBtn.removeClass('available');
    }
  }
  
  if (redoBtn.length) {
    // Enable redo if we're not at the latest state
    const canRedo = historyIndex < history.length - 1;
    redoBtn.prop('disabled', !canRedo);
  }
}

// Update history status display
function updateHistoryStatus() {
  const status = $('#historyStatus');
  if (status.length && history.length > 0) {
    const pendingCount = pendingTileChanges.length > 0 ? ` (+${pendingTileChanges.length})` : '';
    status.text(`Undo: ${historyIndex}/${history.length - 1}${pendingCount}`);
  } else if (pendingTileChanges.length > 0) {
    status.text(`Undo: +${pendingTileChanges.length} pending`);
  } else {
    status.text('');
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
    warning.addClass('show').css('background', 'rgba(255, 77, 125, 0.15)');
    warning.text(`⚠️ Warning: ${tileLibrary.length}/2000 tiles`);
  } else if (tileLibrary.length >= MAX_TILES * 0.7) {
    warning.addClass('show').css('background', 'rgba(255, 221, 77, 0.1)');
    warning.text(`${tileLibrary.length}/2000 tiles`);
  } else {
    warning.removeClass('show');
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
    updateTileAreaDisplay();
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
  
  // Update UI
  $('#tileInfo').text(`${tileLibrary.length} tiles loaded`);
  updateTileCount();
  updateSelectedInfo();
  updateTileAreaDisplay();
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

// === Tile Management Functions ===
function removeLastImportedTiles() {
  if (tileImportHistory.length === 0) {
    alert('No import history to remove');
    return;
  }
  
  const lastImport = tileImportHistory.pop();
  const tilesToRemove = lastImport.tileIndices;
  
  // Ask for confirmation
  const confirmMsg = `Remove last imported ${tilesToRemove.length} tiles?\nFiles: ${lastImport.files.slice(0, 5).join(', ')}${lastImport.files.length > 5 ? '...' : ''}`;
  
  if (!confirm(confirmMsg)) {
    tileImportHistory.push(lastImport); // Put it back
    return;
  }
  
  // Save state before removal for undo
  saveToHistory('Remove Tiles');
  
  // Remove tiles from tileLibrary (remove from end to preserve indices)
  tileLibrary.splice(lastImport.tileCountBefore, tilesToRemove.length);
  
  // Update map to remove references to deleted tiles
  for (let y = 0; y < MapRows; y++) {
    for (let x = 0; x < MapCols; x++) {
      const tileIndex = map[y][x];
      if (tileIndex >= lastImport.tileCountBefore) {
        if (tileIndex < lastImport.tileCountBefore + tilesToRemove.length) {
          // This tile was removed
          map[y][x] = -1;
        } else {
          // Shift indices of tiles that came after
          map[y][x] = tileIndex - tilesToRemove.length;
        }
      }
    }
  }
  
  // Reset selection
  selectedTileIndices.clear();
  if (tileLibrary.length > 0) {
    selectedTileIndex = 0;
    selectedTileIndices.add(0);
  } else {
    selectedTileIndex = -1;
  }
  
  updateTileGrid();
  drawMap();
  updateTileCount();
  
  // Disable remove button if no more history
  if (tileImportHistory.length === 0) {
    $('#removeLastTilesBtn').prop('disabled', true);
  }
  
  alert(`Removed ${tilesToRemove.length} tiles. Total: ${tileLibrary.length}/${MAX_TILES}`);
}

function saveTileSet() {
  if (tileLibrary.length === 0) {
    alert('No tiles to save');
    return;
  }
  
  const setName = prompt('Enter a name for this tile set:', `TileSet_${new Date().toISOString().slice(0,10)}`);
  if (!setName) return;
  
  if (tileSets[setName]) {
    if (!confirm(`A tile set named "${setName}" already exists. Overwrite?`)) {
      return;
    }
  }
  
  // Show saving message
  alert(`Saving ${tileLibrary.length} tiles... Please wait.`);
  
  // Create the tile set data
  const tileSet = {
    name: setName,
    savedAt: new Date().toISOString(),
    tileCount: tileLibrary.length,
    tiles: []
  };
  
  // Convert each tile to base64 data URL
  tileLibrary.forEach((tile, index) => {
    const canvas = tile.canvas;
    const dataURL = canvas.toDataURL('image/png');
    
    tileSet.tiles.push({
      name: tile.name,
      data: dataURL,
      index: index
    });
  });
  
  // Store in localStorage
  tileSets[setName] = tileSet;
  localStorage.setItem('mapEditorTileSets', JSON.stringify(tileSets));
  
  currentSetName = setName;
  alert(`Tile set "${setName}" saved with ${tileSet.tiles.length} tiles`);
}

function loadTileSet() {
  // Load saved sets from localStorage
  const savedSets = localStorage.getItem('mapEditorTileSets');
  if (!savedSets) {
    alert('No saved tile sets found');
    return;
  }
  
  try {
    tileSets = JSON.parse(savedSets);
    
    // Create a list of saved sets
    const setNames = Object.keys(tileSets);
    if (setNames.length === 0) {
      alert('No saved tile sets found');
      return;
    }
    
    // Show selection dialog
    const setName = prompt(`Available tile sets:\n${setNames.join('\n')}\n\nEnter the name of the set to load:`);
    if (!setName || !tileSets[setName]) {
      alert('Invalid selection');
      return;
    }
    
    const tileSet = tileSets[setName];
    
    if (tileLibrary.length > 0) {
      if (!confirm(`This will replace the current ${tileLibrary.length} tiles with ${tileSet.tileCount} tiles. Continue?`)) {
        return;
      }
    }
    
    // Save current state for undo
    saveToHistory('Load Tile Set');
    
    // Clear current tiles
    tileLibrary.length = 0;
    tileImportHistory.length = 0;
    
    // Clear map
    for (let y = 0; y < MapRows; y++) {
      for (let x = 0; x < MapCols; x++) {
        map[y][x] = -1;
      }
    }
    
    // Load tiles from the set
    let loadedCount = 0;
    tileSet.tiles.forEach((tileData) => {
      const img = new Image();
      img.onload = function() {
        const tileCanvas = document.createElement('canvas');
        tileCanvas.width = OriginalTileSize;
        tileCanvas.height = OriginalTileSize;
        const tileCtx = tileCanvas.getContext('2d');
        
        tileCtx.drawImage(img, 0, 0, OriginalTileSize, OriginalTileSize);
        
        tileLibrary.push({
          image: img,
          name: tileData.name,
          canvas: tileCanvas,
          originalIndex: tileData.index
        });
        
        loadedCount++;
        
        if (loadedCount === tileSet.tiles.length) {
          // Update UI
          selectedTileIndices.clear();
          if (tileLibrary.length > 0) {
            selectedTileIndex = 0;
            selectedTileIndices.add(0);
          }
          
          updateTileGrid();
          drawMap();
          updateTileCount();
          
          // Enable/disable remove button
          $('#removeLastTilesBtn').prop('disabled', tileImportHistory.length === 0);
          
          alert(`Loaded tile set "${setName}" with ${tileLibrary.length} tiles`);
        }
      };
      img.src = tileData.data;
    });
    
  } catch (error) {
    console.error('Error loading tile set:', error);
    alert('Error loading tile set');
  }
}

// === Event Listeners ===
function initEventListeners() {
  // File Menu functionality - FIXED VERSION
  $('#fileMenuBtn').on('click', function(e) {
    e.stopPropagation();
    e.preventDefault();
    
    const menu = $('#fileMenuContent');
    const isVisible = menu.hasClass('show');
    
    // Position the menu relative to the button
    const btnRect = this.getBoundingClientRect();
    menu.css({
      position: 'fixed',
      top: btnRect.bottom + 4 + 'px',
      left: btnRect.left + 'px'
    });
    
    if (!isVisible) {
      // Close all other menus first
      $('.file-menu-content').removeClass('show');
      
      // Show this menu
      menu.addClass('show');
      
      // Add click handler to close when clicking outside
      const closeHandler = function(event) {
        if (!menu.is(event.target) && menu.has(event.target).length === 0 &&
            !$('#fileMenuBtn').is(event.target) && $('#fileMenuBtn').has(event.target).length === 0) {
          menu.removeClass('show');
          $(document).off('click', closeHandler);
        }
      };
      
      // Wait for the current event to finish before adding the handler
      setTimeout(() => {
        $(document).on('click', closeHandler);
      }, 0);
    } else {
      menu.removeClass('show');
      // Remove any existing click handlers
      $(document).off('click.fileMenuClose');
    }
  });
  
  // Prevent menu from closing when clicking inside it
  $('#fileMenuContent').on('click', function(e) {
    e.stopPropagation();
  });
  
  // File menu items
  $('#menuImportTiles').on('click', function(e) {
    e.stopPropagation();
    $('#fileMenuContent').removeClass('show');
    setTimeout(() => {
      $('#importTileForMap').click();
    }, 50);
  });
  
  $('#menuImportMap').on('click', function(e) {
    e.stopPropagation();
    $('#fileMenuContent').removeClass('show');
    setTimeout(() => {
      $('#importMapTXT').click();
    }, 50);
  });
  
  $('#menuSaveMap').on('click', function(e) {
    e.stopPropagation();
    $('#fileMenuContent').removeClass('show');
    setTimeout(() => {
      saveMapAsTXT();
    }, 50);
  });
  
  $('#menuExportImage').on('click', function(e) {
    e.stopPropagation();
    $('#fileMenuContent').removeClass('show');
    setTimeout(() => {
      exportMapAsPNG();
    }, 50);
  });
  
  $('#menuClearMap').on('click', function(e) {
    e.stopPropagation();
    $('#fileMenuContent').removeClass('show');
    setTimeout(() => {
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
    }, 50);
  });
  
  // Tile Management buttons
  $('#saveTileSetBtn').on('click', saveTileSet);
  $('#loadTileSetBtn').on('click', loadTileSet);
  $('#removeLastTilesBtn').on('click', removeLastImportedTiles).prop('disabled', true);
  
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
  
  // === Map Editor Event Listeners ===
  let isDragging = false;
  let lastX = -1, lastY = -1;
  let mouseDownTime = 0;

  function updateCoordDisplay(x, y) {
    $('#coordDisplay').text(`X:${x} Y:${y}`);
  }

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
    
    // Clamp to map bounds
    const clampedX = Math.max(0, Math.min(x, MapCols - 1));
    const clampedY = Math.max(0, Math.min(y, MapRows - 1));
    
    // Update coordinate display
    updateCoordDisplay(clampedX, clampedY);
    
    if (isDragging && editorMode === 'place' && tileLibrary.length > 0) {
      // Only update if we moved to a different cell
      if (clampedX !== lastX || clampedY !== lastY) {
        // Check if tile actually changed
        const oldTile = map[clampedY][clampedX];
        if (oldTile !== selectedTileIndex) {
          // Save tile change for undo
          saveTileChange(clampedX, clampedY, oldTile, selectedTileIndex);
          
          map[clampedY][clampedX] = selectedTileIndex;
          lastX = clampedX;
          lastY = clampedY;
          drawMap();
        }
      }
    } else if (selectionRect.isSelecting && editorMode === 'select') {
      selectionRect.endX = clampedX;
      selectionRect.endY = clampedY;
      drawMap();
    }
  });

  $(mapEditorCanvas).on('mousedown', function(e) {
    // Close file menu if open
    $('#fileMenuContent').removeClass('show');
    
    const { x, y } = getMapCoordinates(e);
    
    // Clamp to map bounds
    const clampedX = Math.max(0, Math.min(x, MapCols - 1));
    const clampedY = Math.max(0, Math.min(y, MapRows - 1));
    
    // Update coordinate display
    updateCoordDisplay(clampedX, clampedY);
    
    if (clampedX >= 0 && clampedX < MapCols && clampedY >= 0 && clampedY < MapRows) {
      if (editorMode === 'place' && tileLibrary.length > 0) {
        const oldTile = map[clampedY][clampedX];
        if (oldTile !== selectedTileIndex) {
          // Save tile change for undo
          saveTileChange(clampedX, clampedY, oldTile, selectedTileIndex);
          
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
      // Save pending tile changes as a batch when dragging stops
      if (pendingTileChanges.length > 0) {
        savePendingTileChanges();
      }
    }
    isDragging = false;
    selectionRect.isSelecting = false;
    
    // Check if it was a single click (not drag)
    if (Date.now() - mouseDownTime < 200 && editorMode === 'place') {
      // Save single click as a batch
      if (pendingTileChanges.length > 0) {
        savePendingTileChanges();
      }
    }
  });

  $(mapEditorCanvas).on('mouseleave', function() {
    if (isDragging && pendingTileChanges.length > 0) {
      savePendingTileChanges();
    }
    isDragging = false;
    selectionRect.isSelecting = false;
  });

  // Keyboard shortcuts
  $(document).on('keydown', function(e) {
    // Close file menu on Escape
    if (e.key === 'Escape') {
      $('#fileMenuContent').removeClass('show');
      
      // Also deselect tiles
      selectedTileIndices.clear();
      if (tileLibrary.length > 0) {
        selectedTileIndex = 0;
        selectedTileIndices.add(0);
      }
      updateTileGrid();
    }
    
    // Ctrl+Z for undo
    else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    
    // Ctrl+Y or Ctrl+Shift+Z for redo
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
    
    // Delete key to clear selected tile
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (editorMode === 'place' && tileLibrary.length > 0) {
        selectedTileIndex = -1;
        selectedTileIndices.clear();
        updateTileGrid();
      }
    }
    
    // G key to toggle grid
    else if (e.key === 'g' || e.key === 'G') {
      e.preventDefault();
      toggleGrid();
    }
    
    // F key to toggle fit to screen
    else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      isFitToScreen = !isFitToScreen;
      if (isFitToScreen) {
        TileScale = 0;
      } else {
        TileScale = TileScale === 0 ? 1 : TileScale;
      }
      updateMapCanvasSize();
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
    
    // Record current tile count before import
    const tileCountBeforeImport = tileLibrary.length;
    const batchInfo = {
      timestamp: new Date().toISOString(),
      files: [],
      tileIndices: []
    };
    
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
          
          // Store tile index where it will be added
          const tileIndex = tileLibrary.length;
          batchInfo.files.push(file.name);
          batchInfo.tileIndices.push(tileIndex);
          
          tileLibrary.push({
            image: img,
            name: file.name,
            canvas: tileCanvas,
            originalIndex: tileIndex,
            importedAt: new Date().toISOString()
          });
          
          loadedCount++;
          
          if (loadedCount === files.length) {
            // Record the import batch
            tileImportHistory.push({
              ...batchInfo,
              tileCountBefore: tileCountBeforeImport,
              tileCountAfter: tileLibrary.length
            });
            
            selectedTileIndices.clear();
            selectedTileIndex = tileLibrary.length - files.length;
            selectedTileIndices.add(selectedTileIndex);
            
            updateTileGrid();
            drawMap();
            
            // Save initial state to history
            if (history.length === 0) {
              saveToHistory('Initial State');
            }
            
            // Enable remove last button
            $('#removeLastTilesBtn').prop('disabled', false);
            
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

function saveMapAsTXT() {
  if (tileLibrary.length === 0) {
    alert('No tiles imported yet. Please import some tiles first.');
    return;
  }
  
  let content = '';
  
  for (let y = 0; y < MapRows; y++) {
    const row = [];
    for (let x = 0; x < MapCols; x++) {
      const tileIndex = map[y][x];
      row.push(tileIndex >= 0 ? tileIndex.toString() : '.');
    }
    content += row.join(' ') + '\n';
  }
  
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
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

// === Touch Support for Mobile ===
function initTouchSupport() {
  if (!mapEditorCanvas) return;
  
  // Prevent default touch behavior to avoid scrolling
  mapEditorCanvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  mapEditorCanvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  mapEditorCanvas.addEventListener('touchend', handleTouchEnd, { passive: false });
  
  function handleTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      // Convert touch to mouse event
      const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      mapEditorCanvas.dispatchEvent(mouseEvent);
    }
  }
  
  function handleTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      mapEditorCanvas.dispatchEvent(mouseEvent);
    }
  }
  
  function handleTouchEnd(e) {
    e.preventDefault();
    const mouseEvent = new MouseEvent('mouseup');
    mapEditorCanvas.dispatchEvent(mouseEvent);
  }
}

// === Drag and Drop Support ===
function initDragAndDrop() {
  const dragDropOverlay = document.getElementById('dragDropOverlay');
  if (!dragDropOverlay) return;
  
  let dragCounter = 0;
  
  // Show overlay when dragging files over
  function handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    dragDropOverlay.classList.add('active');
  }
  
  // Hide overlay when dragging leaves
  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter === 0) {
      dragDropOverlay.classList.remove('active');
    }
  }
  
  // Prevent default dragover behavior
  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    dragDropOverlay.classList.add('active');
  }
  
  // Handle file drop
  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    dragDropOverlay.classList.remove('active');
    
    // Close file menu if open
    $('#fileMenuContent').removeClass('show');
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    
    // Filter for PNG files
    const pngFiles = files.filter(file => file.type === 'image/png' || file.name.toLowerCase().endsWith('.png'));
    
    if (pngFiles.length > 0) {
      // Create a new FileList to simulate file input
      const dataTransfer = new DataTransfer();
      pngFiles.forEach(file => dataTransfer.items.add(file));
      
      const fileInput = document.getElementById('importTileForMap');
      if (fileInput) {
        fileInput.files = dataTransfer.files;
        
        // Trigger the change event
        const event = new Event('change', { bubbles: true });
        fileInput.dispatchEvent(event);
      }
    } else {
      alert('Please drop PNG files only');
    }
  }
  
  // Add event listeners
  document.addEventListener('dragenter', handleDragEnter);
  document.addEventListener('dragover', handleDragOver);
  document.addEventListener('dragleave', handleDragLeave);
  document.addEventListener('drop', handleDrop);
  
  // Also prevent default drag behaviors on the page
  document.addEventListener('dragover', function(e) {
    e.preventDefault();
  });
  
  document.addEventListener('drop', function(e) {
    e.preventDefault();
  });
}

// === Initialize Everything ===
$(document).ready(function() {
  initMapEditorCanvas();
  updateMapCanvasSize();
  initEventListeners();
  initTouchSupport();
  initDragAndDrop();
  
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
  
  // Load saved tile sets from localStorage
  try {
    const savedSets = localStorage.getItem('mapEditorTileSets');
    if (savedSets) {
      tileSets = JSON.parse(savedSets);
      console.log(`Found ${Object.keys(tileSets).length} saved tile set(s)`);
    }
  } catch (error) {
    console.error('Error loading saved tile sets:', error);
  }
  
  // Set initial status
  updateViewInfo();
  updateSelectedInfo();
  updateTileCount();
  updateUndoRedoButtons();
  updateHistoryStatus();
  updateTileAreaDisplay();
});

// === Auto-save feature (optional) ===
// Auto-save every 2 minutes
setInterval(() => {
  if (history.length > 0 && historyIndex === history.length - 1 && tileLibrary.length > 0) {
    saveTileSetAuto();
  }
}, 120000);

function saveTileSetAuto() {
  if (tileLibrary.length === 0 || isSavingHistory) return;
  
  const autoSaveName = 'autosave_' + new Date().toISOString().slice(0, 10);
  
  // Similar to saveTileSet but for auto-save
  const tileSet = {
    name: autoSaveName,
    savedAt: new Date().toISOString(),
    tileCount: tileLibrary.length,
    tiles: []
  };
  
  tileLibrary.forEach((tile) => {
    const canvas = tile.canvas;
    const dataURL = canvas.toDataURL('image/png');
    tileSet.tiles.push({
      name: tile.name,
      data: dataURL
    });
  });
  
  // Save only last 5 auto-saves
  const autoSaves = JSON.parse(localStorage.getItem('mapEditorAutoSaves') || '[]');
  autoSaves.push(tileSet);
  if (autoSaves.length > 5) {
    autoSaves.shift();
  }
  localStorage.setItem('mapEditorAutoSaves', JSON.stringify(autoSaves));
  
  console.log('Auto-saved tiles:', tileLibrary.length);
}