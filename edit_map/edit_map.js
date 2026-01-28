// === Settings === line 1 
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

// === LOCALSTORAGE PERSISTENCE ===
const STORAGE_KEY = 'mapEditorData';

// Save everything to localStorage
function saveToLocalStorage() {
  try {
    // Prepare tile library data (convert canvases to data URLs)
    const tileData = tileLibrary.map(tile => ({
      name: tile.name,
      dataURL: tile.canvas.toDataURL('image/png'),
      importedAt: tile.importedAt || new Date().toISOString()
    }));
    
    // Prepare map data
    const mapData = map.map(row => [...row]);
    
    // Prepare editor state
    const editorState = {
      selectedTileIndices: Array.from(selectedTileIndices),
      selectedTileIndex: selectedTileIndex,
      showGrid: showGrid,
      editorMode: editorMode,
      TileScale: TileScale,
      isFitToScreen: isFitToScreen,
      selectionRect: { ...selectionRect },
      historyIndex: historyIndex,
      pendingTileChanges: [...pendingTileChanges],
      tileImportHistory: [...tileImportHistory],
      currentSetName: currentSetName,
      savedAt: new Date().toISOString()
    };
    
    // Prepare history (only save map states, not canvas elements)
    const historyData = history.map(entry => ({
      map: entry.map.map(row => [...row]),
      action: entry.action,
      timestamp: entry.timestamp,
      batch: entry.batch,
      changeCount: entry.changeCount
    }));
    
    // Create the complete data object
    const saveData = {
      version: '1.0',
      tileData: tileData,
      mapData: mapData,
      editorState: editorState,
      historyData: historyData,
      tileSets: tileSets,
      lastSaved: new Date().toISOString()
    };
    
    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
    
    console.log('Saved to localStorage:', {
      tiles: tileData.length,
      mapSize: `${MapCols}x${MapRows}`,
      history: historyData.length
    });
    
    // Update status if needed
    const saveStatus = $('#saveStatus');
    if (saveStatus.length) {
      saveStatus.text('Auto-saved').addClass('show');
      setTimeout(() => saveStatus.removeClass('show'), 2000);
    }
    
    return true;
  } catch (error) {
    console.error('Error saving to localStorage:', error);
    return false;
  }
}

// Load everything from localStorage
function loadFromLocalStorage() {
  try {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (!savedData) {
      console.log('No saved data found in localStorage');
      return false;
    }
    
    const data = JSON.parse(savedData);
    console.log('Loading from localStorage:', data);
    
    // IMPORTANT: Clear ALL current data before loading
    tileLibrary.length = 0; // Clear tileLibrary array
    tileImportHistory.length = 0;
    history.length = 0;
    pendingTileChanges.length = 0;
    
    // Also clear the map
    for (let y = 0; y < MapRows; y++) {
      for (let x = 0; x < MapCols; x++) {
        map[y][x] = -1;
      }
    }
    
    // Clear selections
    selectedTileIndices.clear();
    selectedTileIndex = 0;
    
    // Load tile library
    if (data.tileData && Array.isArray(data.tileData)) {
      console.log(`Found ${data.tileData.length} tiles to load`);
      
      // Use Promise to handle async image loading
      return new Promise((resolve) => {
        let loadedCount = 0;
        const totalTiles = data.tileData.length;
        
        // If no tiles to load, resolve immediately
        if (totalTiles === 0) {
          restoreAfterTileLoad(data);
          resolve(true);
          return;
        }
        
        data.tileData.forEach((tileData, index) => {
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
              importedAt: tileData.importedAt || new Date().toISOString()
            });
            
            loadedCount++;
            
            if (loadedCount === totalTiles) {
              console.log(`Successfully loaded ${loadedCount} tiles from localStorage`);
              restoreAfterTileLoad(data);
              resolve(true);
            }
          };
          
          img.onerror = function() {
            console.error('Failed to load tile:', tileData.name);
            loadedCount++;
            if (loadedCount === totalTiles) {
              restoreAfterTileLoad(data);
              resolve(true);
            }
          };
          
          img.src = tileData.dataURL;
        });
      });
    } else {
      // No tile data to load
      restoreAfterTileLoad(data);
      return true;
    }
  } catch (error) {
    console.error('Error loading from localStorage:', error);
    return false;
  }
}

// Helper function to restore data after tiles are loaded
function restoreAfterTileLoad(data) {
  // Restore map data
  if (data.mapData && Array.isArray(data.mapData)) {
    console.log('Restoring map data...');
    for (let y = 0; y < Math.min(MapRows, data.mapData.length); y++) {
      for (let x = 0; x < Math.min(MapCols, data.mapData[y].length); x++) {
        map[y][x] = data.mapData[y][x];
      }
    }
  }
  
  // Restore editor state
  if (data.editorState) {
    const state = data.editorState;
    console.log('Restoring editor state...', state);
    
    // Restore selections
    if (state.selectedTileIndices && Array.isArray(state.selectedTileIndices)) {
      selectedTileIndices = new Set(state.selectedTileIndices);
    }
    selectedTileIndex = state.selectedTileIndex || 0;
    
    // Restore UI states
    showGrid = state.showGrid !== undefined ? state.showGrid : true;
    editorMode = state.editorMode || 'place';
    TileScale = state.TileScale || 0;
    isFitToScreen = state.isFitToScreen !== undefined ? state.isFitToScreen : true;
    
    // Restore selection rectangle
    if (state.selectionRect) {
      Object.assign(selectionRect, state.selectionRect);
    }
    
    // Restore history
    historyIndex = state.historyIndex || -1;
    pendingTileChanges = state.pendingTileChanges || [];
    tileImportHistory = state.tileImportHistory || [];
    currentSetName = state.currentSetName || null;
  }
  
  // Restore history
  if (data.historyData && Array.isArray(data.historyData)) {
    console.log(`Restoring ${data.historyData.length} history entries`);
    history = data.historyData.map(entry => ({
      map: entry.map.map(row => [...row]),
      action: entry.action,
      timestamp: entry.timestamp,
      batch: entry.batch,
      changeCount: entry.changeCount
    }));
  }
  
  // Restore tile sets if they exist
  if (data.tileSets) {
    tileSets = data.tileSets;
  }
  
  // Update UI
  updateTileGrid();
  drawMap();
  updateUndoRedoButtons();
  updateHistoryStatus();
  updateGridStatus();
  updateSelectedInfo();
  updateTileCount();
  
  // Update UI based on editor mode
  $('#modePlace').toggleClass('active', editorMode === 'place');
  $('#modeSelect').toggleClass('active', editorMode === 'select');
  $('#gridToggleBtn').toggleClass('active', showGrid);
  
  // Update canvas cursor
  mapEditorCanvas.style.cursor = editorMode === 'place' ? 'crosshair' : 'cell';
  
  console.log('Successfully restored from localStorage');
  
}

// Clear localStorage data and reset the editor
// function clearLocalStorage() {
//   if (confirm('Clear all saved map editor data from browser storage? This will:\n\n' +
//              '• Remove all saved tiles and map data\n' +
//              '• Clear undo/redo history\n' +
//              '• Reset all preferences\n' +
//              '• Reload the page\n\n' +
//              'This cannot be undone!')) {
    
//     // Show loading/clearing message
//     const originalText = $('#clearSessionBtn').text();
//     $('#clearSessionBtn').text('Clearing...').prop('disabled', true);
    
//     // Clear all localStorage items related to the map editor
//     localStorage.removeItem(STORAGE_KEY); // Main save data
//     localStorage.removeItem('mapEditorTileSets'); // Tile sets
//     localStorage.removeItem('mapEditorAutoSaves'); // Auto-saves
    
//     // Also clear any other potential storage keys
//     const keysToRemove = [];
//     for (let i = 0; i < localStorage.length; i++) {
//       const key = localStorage.key(i);
//       if (key.includes('mapEditor') || key.includes('tileSet')) {
//         keysToRemove.push(key);
//       }
//     }
    
//     keysToRemove.forEach(key => {
//       localStorage.removeItem(key);
//     });
    
//     // Reset all variables to default state
//     resetEditorToDefault();
    
//     // Update UI
//     updateTileGrid();
//     drawMap();
//     updateTileCount();
//     updateSelectedInfo();
//     updateUndoRedoButtons();
//     updateHistoryStatus();
    
//     // Reset button state after a short delay
//     setTimeout(() => {
//       $('#clearSessionBtn').text(originalText).prop('disabled', false);
      
//       // Show confirmation
//       alert('All saved data cleared successfully! The editor has been reset to default state.');
      
//       // Optionally reload the page for a clean start
//       if (confirm('Reload page for a completely fresh start?')) {
//         location.reload();
//       }
//     }, 500);
//   }
// }

// Reset editor to default state
function resetEditorToDefault() {
  console.log('Resetting editor to default state...');
  
  // Clear tile library
  tileLibrary.length = 0;
  
  // Clear tile import history
  tileImportHistory.length = 0;
  
  // Clear tile sets
  tileSets = {};
  
  // Clear current set name
  currentSetName = null;
  
  // Clear map
  for (let y = 0; y < MapRows; y++) {
    for (let x = 0; x < MapCols; x++) {
      map[y][x] = -1;
    }
  }
  
  // Reset selections
  selectedTileIndices.clear();
  selectedTileIndex = 0;
  
  // Reset editor state
  showGrid = true;
  editorMode = 'place';
  TileScale = 0;
  isFitToScreen = true;
  
  // Reset selection rectangle
  selectionRect = {
    startX: -1,
    startY: -1,
    endX: -1,
    endY: -1,
    isSelecting: false
  };
  
  // Clear history
  history.length = 0;
  historyIndex = -1;
  pendingTileChanges.length = 0;
  
  // Update UI elements
  $('#modePlace').addClass('active');
  $('#modeSelect').removeClass('active');
  $('#gridToggleBtn').addClass('active');
  $('#removeLastTilesBtn').prop('disabled', true);
  
  // Update canvas cursor
  if (mapEditorCanvas) {
    mapEditorCanvas.style.cursor = 'crosshair';
  }
  
  // Update displays
  updateGridStatus();
  updateZoomDisplay();
  updateViewInfo();
  
  // Save new initial state
  saveToHistory('Initial State (After Clear)');
  
  console.log('Editor reset complete');
}
// Alternative: Custom confirmation modal
function showClearConfirmation() {
  // Create modal HTML
  const modalHTML = `
    <div id="clearConfirmModal" class="modal-overlay" style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    ">
      <div class="modal-content" style="
        background: #2d3748;
        padding: 20px;
        border-radius: 8px;
        max-width: 400px;
        width: 90%;
        border: 1px solid #4a5568;
      ">
        <h3 style="margin-top: 0; color: #e2e8f0;">Clear All Saved Data?</h3>
        <p style="color: #cbd5e0; margin-bottom: 20px;">
          This will permanently delete:
        </p>
        <ul style="color: #cbd5e0; margin-bottom: 20px; padding-left: 20px;">
          <li>All imported tiles (${tileLibrary.length} tiles)</li>
          <li>Current map design</li>
          <li>Undo/redo history (${history.length} steps)</li>
          <li>All saved tile sets (${Object.keys(tileSets).length} sets)</li>
          <li>Editor preferences</li>
        </ul>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="cancelClearBtn" class="btn" style="background: #4a5568;">Cancel</button>
          <button id="confirmClearBtn" class="btn" style="background: #e53e3e;">Clear Everything</button>
        </div>
      </div>
    </div>
  `;
  
  // Add modal to page
  $('body').append(modalHTML);
  
  // Handle cancel
  $('#cancelClearBtn').on('click', function() {
    $('#clearConfirmModal').remove();
  });
  
  // Handle confirm
  $('#confirmClearBtn').on('click', function() {
    $('#clearConfirmModal').remove();
    clearLocalStorage();
  });
  
  // Close modal on background click
  $('#clearConfirmModal').on('click', function(e) {
    if (e.target === this) {
      $(this).remove();
    }
  });
  
  // Close on Escape key
  $(document).on('keydown.clearModal', function(e) {
    if (e.key === 'Escape') {
      $('#clearConfirmModal').remove();
      $(document).off('keydown.clearModal');
    }
  });
}
// Clear localStorage data and reset the editor
function clearLocalStorage() {
  // Show custom confirmation modal
  showClearConfirmation();
}

// The actual clearing function
function performClearStorage() {
  // Show progress indicator
  showClearingProgress();
  
  // Disable the clear button
  const clearBtn = $('#clearSessionBtn');
  clearBtn.prop('disabled', true).addClass('btn-clearing');
  
  // Clear all localStorage items
  const keysToRemove = [
    STORAGE_KEY,
    'mapEditorTileSets',
    'mapEditorAutoSaves'
  ];
  
  // Add any other map editor related keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('mapEditor_') || key.includes('tileSet')) {
      keysToRemove.push(key);
    }
  }
  
  // Remove all keys
  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
  });
  
  // Reset editor state
  resetEditorToDefault();
  
  // Update UI immediately
  updateTileAreaDisplay();
  updateClearButtonState();
  
  // Hide progress after 1.5 seconds
  setTimeout(() => {
    hideClearingProgress();
    
    // Show success message after progress is hidden
    setTimeout(() => {
      showSuccessMessage('All saved data cleared successfully!');
      
      // Re-enable button after everything is done
      clearBtn.prop('disabled', false).removeClass('btn-clearing');
      
      // Auto-save the new empty state
      setTimeout(saveToLocalStorage, 1000);
    }, 300); // Short delay to ensure progress is gone
  }, 1500);
}

// Alternative: Basic confirmation version
function clearLocalStorageBasic() {
  if (confirm('Clear all saved map editor data from browser storage? This will:\n\n' +
             '• Remove all saved tiles and map data\n' +
             '• Clear undo/redo history\n' +
             '• Reset all preferences\n' +
             '• The page will reload\n\n' +
             'This cannot be undone!')) {
    
    // Show loading/clearing message
    const originalText = $('#clearSessionBtn').text();
    $('#clearSessionBtn').text('Clearing...').prop('disabled', true);
    
    // Clear all localStorage items related to the map editor
    localStorage.removeItem(STORAGE_KEY); // Main save data
    localStorage.removeItem('mapEditorTileSets'); // Tile sets
    localStorage.removeItem('mapEditorAutoSaves'); // Auto-saves
    
    // Also clear any other potential storage keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.includes('mapEditor') || key.includes('tileSet')) {
        localStorage.removeItem(key);
        i--; // Adjust index after removal
      }
    }
    
    // Reset all variables to default state
    resetEditorToDefault();
    
    // Update UI
    updateTileGrid();
    drawMap();
    updateTileCount();
    updateSelectedInfo();
    updateUndoRedoButtons();
    updateHistoryStatus();
    
    // Reset button state after a short delay
    setTimeout(() => {
      $('#clearSessionBtn').text(originalText).prop('disabled', false);
      
      // Show confirmation
      alert('All saved data cleared successfully! The editor has been reset to default state.');
      
      // Optionally reload the page for a clean start
      if (confirm('Reload page for a completely fresh start?')) {
        location.reload();
      }
    }, 500);
  }
}
// Show progress during clearing
function showClearingProgress() {
  const progressHTML = `
    <div id="clearingProgress" class="status-clearing">
      <div style="text-align: center;">
        <div style="margin-bottom: 10px;">🧹 Clearing saved data...</div>
        <div style="font-size: 12px; opacity: 0.8;">Please wait</div>
      </div>
    </div>
  `;
  
  $('body').append(progressHTML);
  
  return {
    hide: function() {
      setTimeout(() => {
        $('#clearingProgress').fadeOut(300, function() {
          $(this).remove();
        });
      }, 1000);
    }
  };
}
// Updated clearLocalStorage with progress indicator
function clearLocalStorage() {
  // Show progress indicator
  const progress = showClearingProgress();
  
  // Disable the clear button
  $('#clearSessionBtn').addClass('btn-clearing').prop('disabled', true);
  
  // Clear all localStorage items
  const keysToRemove = [
    STORAGE_KEY,
    'mapEditorTileSets',
    'mapEditorAutoSaves'
  ];
  
  // Add any other map editor related keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('mapEditor_') || key.includes('tileSet')) {
      keysToRemove.push(key);
    }
  }
  
  // Remove all keys
  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
  });
  
  // Reset editor state
  resetEditorToDefault();
  
  // Hide progress and re-enable button after a delay
  setTimeout(() => {
    progress.hide();
    $('#clearSessionBtn').removeClass('btn-clearing').prop('disabled', false);
    
    // Show success message
    showSuccessMessage('All saved data cleared successfully!');
    
    // Auto-save the new empty state
    setTimeout(saveToLocalStorage, 500);
  }, 1500);
}
// Show success message
function showSuccessMessage(message) {
  const successHTML = `
    <div id="successMessage" style="
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #38a169;
      color: white;
      padding: 10px 20px;
      border-radius: 4px;
      z-index: 1000;
      animation: slideIn 0.3s ease-out;
    ">
      ✅ ${message}
    </div>
  `;
  
  $('body').append(successHTML);
  
  // Remove after 3 seconds
  setTimeout(() => {
    $('#successMessage').fadeOut(300, function() {
      $(this).remove();
    });
  }, 3000);
}
// Alternative: Soft reset (keep preferences)
function softResetEditor() {
  if (confirm('Reset editor but keep:\n• Tile library\n• Saved tile sets\n\nClear only:\n• Current map\n• History\n• Selections\n\nContinue?')) {
    
    // Clear map
    for (let y = 0; y < MapRows; y++) {
      for (let x = 0; x < MapCols; x++) {
        map[y][x] = -1;
      }
    }
    
    // Clear selections
    selectedTileIndices.clear();
    if (tileLibrary.length > 0) {
      selectedTileIndex = 0;
      selectedTileIndices.add(0);
    }
    
    // Clear history
    history.length = 0;
    historyIndex = -1;
    pendingTileChanges.length = 0;
    
    // Clear selection rectangle
    selectionRect = {
      startX: -1,
      startY: -1,
      endX: -1,
      endY: -1,
      isSelecting: false
    };
    
    // Update UI
    updateTileGrid();
    drawMap();
    updateUndoRedoButtons();
    updateHistoryStatus();
    updateSelectedInfo();
    
    // Save new initial state
    saveToHistory('Soft Reset');
    
    // alert('Editor reset successfully. Tiles preserved.');
  }
}

// Add a soft reset button to HTML:
// <button id="softResetBtn" class="btn" title="Reset map but keep tiles">🔄 Soft Reset</button>

// Add to event listeners:
$('#softResetBtn').on('click', softResetEditor);

// CSS for animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;
document.head.appendChild(style);
// === Initialize Everything ===
$(document).ready(function() {
  initMapEditorCanvas();
  updateMapCanvasSize();
  initEventListeners();
  initTouchSupport();
  initDragAndDrop();
  setupCustomScrollbar();

  // Show loading message
  console.log('Starting initialization...');
  
  // Try to load from localStorage first
  console.log('Attempting to load from localStorage...');
  const loadPromise = loadFromLocalStorage();
  
  if (loadPromise && loadPromise.then) {
    // Handle async loading
    loadPromise.then((loaded) => {
      if (!loaded || tileLibrary.length === 0) {
        initializeDefaultUI();
      }
      completeInitialization();
    }).catch((error) => {
      console.error('Error during localStorage loading:', error);
      initializeDefaultUI();
      completeInitialization();
    });
  } else {
    // Sync loading or no data
    if (!loadPromise || tileLibrary.length === 0) {
      initializeDefaultUI();
    }
    completeInitialization();
  }
  // Add to your existing JavaScript
function setupCustomScrollbar() {
  const centerGroup = document.querySelector('.control-group:nth-child(2)');
  if (!centerGroup) return;
  
  let scrollTimeout;
  
  centerGroup.addEventListener('scroll', function() {
    // Show scrollbar when scrolling
    this.classList.add('scrolling');
    
    // Clear previous timeout
    clearTimeout(scrollTimeout);
    
    // Hide scrollbar after 1 second of inactivity
    scrollTimeout = setTimeout(() => {
      this.classList.remove('scrolling');
    }, 1000);
  });
  
  // Also show on hover
  centerGroup.addEventListener('mouseenter', function() {
    this.classList.add('hovering');
  });
  
  centerGroup.addEventListener('mouseleave', function() {
    this.classList.remove('hovering');
  });
}
  
  // Helper functions
  function initializeDefaultUI() {
    console.log('Initializing default UI...');
    updateGridStatus();
    $('#gridToggleBtn').toggleClass('active', showGrid);
    
    // Auto-select first tile if available
    if (tileLibrary.length > 0) {
      selectedTileIndex = 0;
      selectedTileIndices.add(0);
      updateTileGrid();
    }
    
    // Save initial empty state to history
    saveToHistory('Initial State');
  }
  
// In the completeInitialization() function, add:
function completeInitialization() {
  console.log('Completing initialization...');
  
  // Set initial canvas cursor
  mapEditorCanvas.style.cursor = editorMode === 'place' ? 'crosshair' : 'cell';
  
  drawMap();
  
  // Set up auto-save
  setupAutoSave();
  setupBeforeUnload();
  
  // Handle window resize
  $(window).on('resize', handleResize);
  
  // Load saved tile sets from localStorage (separate from map data)
  try {
    const savedSets = localStorage.getItem('mapEditorTileSets');
    if (savedSets) {
      const loadedSets = JSON.parse(savedSets);
      // Merge with any tile sets loaded from main save data
      tileSets = { ...loadedSets, ...tileSets };
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
  
  // Initialize grid status display
  updateGridStatus();
  
  // Initialize storage info
  showStorageUsage();
  
  console.log('Initialization complete');
}
});
// Auto-save function (call this periodically)
let autoSaveTimer = null;
function setupAutoSave() {
  // Clear any existing timer
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
  }
  
  // Auto-save every 30 seconds
  autoSaveTimer = setInterval(() => {
    if (tileLibrary.length > 0 || history.length > 0) {
      saveToLocalStorage();
    }
  }, 30000);
}

// Save on page unload
function setupBeforeUnload() {
  window.addEventListener('beforeunload', function(e) {
    if (tileLibrary.length > 0 || history.length > 0) {
      saveToLocalStorage();
    }
  });
}
// === TILE AREA DISPLAY FUNCTIONS ===
function updateTileAreaDisplay() {
  const tileGrid = document.getElementById('tileGrid');
  const importBtnPlaceholder = document.getElementById('importTilesBtnPlaceholder'); // Changed from importBtn
  const importBtn = document.getElementById('importTilesBtn'); // This is the button in tile-management
  const emptyTiles = document.getElementById('emptyTiles');
  
  if (!tileGrid || !emptyTiles) return;
  
  if (tileGrid.children.length > 0) {
    // Hide placeholder and empty state when tiles exist
    if (importBtnPlaceholder) importBtnPlaceholder.style.display = 'none';
    emptyTiles.style.display = 'none';
  } else {
    // Show placeholder and empty state when no tiles
    if (importBtnPlaceholder) importBtnPlaceholder.style.display = 'flex';
    emptyTiles.style.display = 'flex';
  }
  
  // The import button in tile-management should always be visible
  if (importBtn) {
    importBtn.style.display = 'flex'; // Always show the button
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
  if (!batch && action !== 'Initial State') {
    setTimeout(saveToLocalStorage, 100);
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
  setTimeout(saveToLocalStorage, 100);
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

  setTimeout(saveToLocalStorage, 100);
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

// Toggle grid visibility
// Toggle grid visibility
function toggleGrid() {
  showGrid = !showGrid;
  $('#gridToggleBtn').toggleClass('active', showGrid);
  
  // Force a redraw of the map with updated grid visibility
  drawMap();
  updateGridStatus();

  setTimeout(saveToLocalStorage, 100);
}

// Update grid status display
function updateGridStatus() {
  const gridStatus = $('#gridStatus');
  if (gridStatus.length) {
    gridStatus.text(showGrid ? 'Grid: ON' : 'Grid: OFF');
  }
}

// In the drawMap() function, replace the grid drawing logic:
function drawMap() {
  if (!mapEditorCtx) return;
  
  const effectiveTileScale = isFitToScreen && TileScale === 0 ? calculateFitZoom() : TileScale;
  
  // Clear map
  mapEditorCtx.fillStyle = '#222';
  mapEditorCtx.fillRect(0, 0, mapEditorCanvas.width, mapEditorCanvas.height);
  
  // Draw grid (if enabled)
  if (showGrid) {
    mapEditorCtx.strokeStyle = effectiveTileScale >= 2 ? '#333' : '#444'; // Darker at low zoom
    mapEditorCtx.lineWidth = 1;
    
    // For very small zoom levels, use a more subtle grid or skip every other line
    const shouldThinGrid = effectiveTileScale < 2;
    const gridStep = shouldThinGrid ? 2 : 1;
    
    // Draw horizontal grid lines
    for (let y = 0; y <= MapRows; y += gridStep) {
      mapEditorCtx.beginPath();
      mapEditorCtx.moveTo(0, y * OriginalTileSize * effectiveTileScale);
      mapEditorCtx.lineTo(mapEditorCanvas.width, y * OriginalTileSize * effectiveTileScale);
      mapEditorCtx.stroke();
    }
    
    // Draw vertical grid lines
    for (let x = 0; x <= MapCols; x += gridStep) {
      mapEditorCtx.beginPath();
      mapEditorCtx.moveTo(x * OriginalTileSize * effectiveTileScale, 0);
      mapEditorCtx.lineTo(x * OriginalTileSize * effectiveTileScale, mapEditorCanvas.height);
      mapEditorCtx.stroke();
    }
    
    // If we're thinning the grid, add a subtle indicator
    if (shouldThinGrid && effectiveTileScale > 0.5) {
      mapEditorCtx.strokeStyle = '#222';
      mapEditorCtx.lineWidth = 2;
      
      // Draw thicker lines at the boundaries
      mapEditorCtx.beginPath();
      mapEditorCtx.moveTo(0, 0);
      mapEditorCtx.lineTo(mapEditorCanvas.width, 0);
      mapEditorCtx.stroke();
      
      mapEditorCtx.beginPath();
      mapEditorCtx.moveTo(0, 0);
      mapEditorCtx.lineTo(0, mapEditorCanvas.height);
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
    const tileInfo = selectedTileIndex >= 0 ? ` (Tile: ${selectedTileIndex})` : '';
    $('#selectionInfo').addClass('show').text(`${width}×${height}${tileInfo}`);
  } else {
    $('#selectionInfo').removeClass('show');
  }
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

// Add this function to show storage usage
function showStorageUsage() {
  try {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      const sizeInBytes = new Blob([savedData]).size;
      const sizeInKB = (sizeInBytes / 1024).toFixed(2);
      console.log(`LocalStorage usage: ${sizeInKB} KB`);
      
      // Update storage info in UI
      const storageInfo = $('#storageInfo');
      if (storageInfo.length) {
        storageInfo.text(`Storage: ${sizeInKB} KB`);
      }
    } else {
      const storageInfo = $('#storageInfo');
      if (storageInfo.length) {
        storageInfo.text('Storage: 0 KB');
      }
    }
  } catch (error) {
    console.error('Error calculating storage usage:', error);
    const storageInfo = $('#storageInfo');
    if (storageInfo.length) {
      storageInfo.text('Storage: N/A');
    }
  }
}

// Call this after saving
showStorageUsage();

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
  // alert(`Saving ${tileLibrary.length} tiles... Please wait.`);
  
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
  // alert(`Tile set "${setName}" saved with ${tileSet.tiles.length} tiles`);
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
          
          //alert(`Loaded tile set "${setName}" with ${tileLibrary.length} tiles`);
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
  $('#saveSessionBtn').on('click', function() {
    if (saveToLocalStorage()) {
      alert('Session saved successfully!');
    } else {
      alert('Error saving session.');
    }
  });
  
  $('#loadSessionBtn').on('click', function() {
    if (confirm('Load last saved session? Current unsaved changes will be lost.')) {
      loadFromLocalStorage();
      updateClearButtonState();
    }
  });
  
  $('#clearSessionBtn').on('click', clearLocalStorage);
  // Fill Selection button
  $('#fillSelectionBtn').on('click', function() {
    if (selectionRect.startX < 0 || selectionRect.startY < 0 || 
        selectionRect.endX < 0 || selectionRect.endY < 0) {
      alert('Please select an area first by clicking and dragging in Select mode.');
      return;
    }
    
    if (tileLibrary.length === 0) {
      alert('No tiles imported. Please import tiles first.');
      return;
    }
    
    if (selectedTileIndex < 0) {
      alert('No tile selected. Please select a tile first.');
      return;
    }
    
    fillSelectionWithTile();
    drawMap();
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
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      if (editorMode === 'select' && 
          selectionRect.startX >= 0 && selectionRect.startY >= 0 &&
          selectionRect.endX >= 0 && selectionRect.endY >= 0 &&
          selectedTileIndex >= 0) {
        fillSelectionWithTile();
        drawMap();
      }
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

  // In the keyboard event handler, fix the 'G' key handler:
  $(document).on('keydown', function(e) {
    // Close file menu on Escape
    if (e.key === 'Escape') {
      $('#fileMenuContent').removeClass('show');
      
      // Clear selection rectangle if in select mode
      if (editorMode === 'select') {
        clearSelection();
        drawMap();
      }
      
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
    
    // G key to toggle grid - FIXED
    else if (e.key === 'g' || e.key === 'G') {
      e.preventDefault();
      toggleGrid();
      // updateGridStatus(); // Already called in toggleGrid()
    }
    
    // F key to toggle fit to screen - FIXED
    else if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      isFitToScreen = !isFitToScreen;
      if (isFitToScreen) {
        TileScale = 0;
      } else {
        TileScale = TileScale === 0 ? 1 : TileScale;
      }
      updateMapCanvasSize();
    }
    
    // Ctrl+F to fill selection
    else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      if (editorMode === 'select' && 
          selectionRect.startX >= 0 && selectionRect.startY >= 0 &&
          selectionRect.endX >= 0 && selectionRect.endY >= 0 &&
          selectedTileIndex >= 0) {
        fillSelectionWithTile();
        drawMap();
      }
    }
  });


  // Zoom Functions
  $('#zoomInBtn').on('click', function() {
    isFitToScreen = false;
    if (TileScale < MAX_TileScale) {
      TileScale = TileScale === 0 ? 1 : TileScale + 1;
      updateMapCanvasSize();
      updateGridStatus();
    }
  });

  $('#zoomOutBtn').on('click', function() {
    isFitToScreen = false;
    if (TileScale > MIN_TileScale) {
      TileScale--;
      updateMapCanvasSize();
      updateGridStatus();
    }
  });

  $('#zoom1xBtn').on('click', function() {
    isFitToScreen = false;
    TileScale = 1;
    updateMapCanvasSize();
    updateGridStatus();
  });

  $('#fitMapBtn').on('click', function() {
    isFitToScreen = true;
    TileScale = 0;
    updateMapCanvasSize();
    updateGridStatus();
  });

  // Import PNG for Map Editor
$('#importTileForMap').on('change', function(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;
  
  // Check for duplicates BEFORE importing
  const existingTileNames = new Set(tileLibrary.map(tile => tile.name));
  const newFiles = [];
  const duplicateFiles = [];
  
  files.forEach(file => {
    if (existingTileNames.has(file.name)) {
      duplicateFiles.push(file.name);
    } else {
      newFiles.push(file);
    }
  });
  
  // Warn about duplicates
  if (duplicateFiles.length > 0) {
    const msg = `Found ${duplicateFiles.length} duplicate file(s):\n${duplicateFiles.slice(0, 5).join('\n')}${duplicateFiles.length > 5 ? '\n...' : ''}\n\nSkip duplicates and continue importing ${newFiles.length} new files?`;
    if (!confirm(msg)) {
      // Clear the file input
      this.value = '';
      return;
    }
  }
  
  if (newFiles.length === 0) {
    alert('All selected files are already imported.');
    // Clear the file input
    this.value = '';
    return;
  }
  
  if (tileLibrary.length + newFiles.length > MAX_TILES) {
    alert(`Cannot import ${newFiles.length} tiles. Maximum limit is ${MAX_TILES} tiles (000-1999).\nCurrent: ${tileLibrary.length}/${MAX_TILES}`);
    // Clear the file input
    this.value = '';
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
  
  newFiles.forEach((file, fileIndex) => {
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
        
        if (loadedCount === newFiles.length) {
          // Record the import batch
          tileImportHistory.push({
            ...batchInfo,
            tileCountBefore: tileCountBeforeImport,
            tileCountAfter: tileLibrary.length
          });
          
          // Auto-select the first newly imported tile
          selectedTileIndices.clear();
          if (tileLibrary.length > 0) {
            selectedTileIndex = tileCountBeforeImport; // Select first new tile
            selectedTileIndices.add(selectedTileIndex);
          }
          
          updateTileGrid();
          drawMap();
          
          // Save initial state to history if needed
          if (history.length === 0) {
            saveToHistory('Initial State');
          }
          
          // Enable remove last button
          $('#removeLastTilesBtn').prop('disabled', false);
          
          // Auto-save to localStorage
          setTimeout(saveToLocalStorage, 100);
          
          // Clear the file input
          $('#importTileForMap').val('');
          
          // Show summary
          let message = `Added ${newFiles.length} new tile(s). Total: ${tileLibrary.length}/${MAX_TILES}`;
          if (duplicateFiles.length > 0) {
            message += `\n(Skipped ${duplicateFiles.length} duplicate(s))`;
          }
          alert(message);
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
  // Editor Mode Buttons
$('#modePlace').on('click', function() {
  // Check if we're coming from Select mode with an active selection
  const hadSelection = editorMode === 'select' && 
    selectionRect.startX >= 0 && selectionRect.startY >= 0 &&
    selectionRect.endX >= 0 && selectionRect.endY >= 0;
  
  editorMode = 'place';
  $('#modePlace').addClass('active');
  $('#modeSelect').removeClass('active');
  
  // Update canvas cursor
  mapEditorCanvas.style.cursor = 'crosshair';
  
  // If we had a selection in Select mode, fill it with the selected tile
  if (hadSelection && tileLibrary.length > 0 && selectedTileIndex >= 0) {
    fillSelectionWithTile();
  }
  
  // Clear selection rectangle when switching modes
  clearSelection();
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
  $('#clearSessionBtn').on('click', function() {
    clearLocalStorage();
  });
  
  // Initialize map info display
  $('#mapInfo').text(`Map: ${MapCols}×${MapRows}`);
  updateTileCount();
  updateSelectedInfo();
  updateUndoRedoButtons();
  updateClearButtonState();
}
function updateClearButtonState() {
  const clearBtn = $('#clearSessionBtn');
  if (clearBtn.length) {
    // Check if there's any data to clear
    const hasSavedData = localStorage.getItem(STORAGE_KEY) !== null;
    clearBtn.prop('disabled', !hasSavedData);
    if (!hasSavedData) {
      clearBtn.addClass('disabled');
    } else {
      clearBtn.removeClass('disabled');
    }
  }
}
// Fill selection rectangle with selected tile
function fillSelectionWithTile() {
  // Validate selection bounds
  const x1 = Math.min(selectionRect.startX, selectionRect.endX);
  const y1 = Math.min(selectionRect.startY, selectionRect.endY);
  const x2 = Math.max(selectionRect.startX, selectionRect.endX);
  const y2 = Math.max(selectionRect.startY, selectionRect.endY);
  
  // Validate tile selection
  if (selectedTileIndex < 0 || selectedTileIndex >= tileLibrary.length) {
    alert('Please select a valid tile first.');
    return;
  }
  
  // Calculate area size
  const width = x2 - x1 + 1;
  const height = y2 - y1 + 1;
  const area = width * height;
  
  // Ask for confirmation for large areas
  if (area > 100) {
    if (!confirm(`Fill ${width}×${height} area (${area} cells) with tile ${selectedTileIndex}?`)) {
      return;
    }
  }
  
  // Save state for undo before making changes
  let changedCells = 0;
  
  // Fill each cell in the selection with the selected tile
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      if (x >= 0 && x < MapCols && y >= 0 && y < MapRows) {
        const oldTile = map[y][x];
        if (oldTile !== selectedTileIndex) {
          // Save the change for undo
          saveTileChange(x, y, oldTile, selectedTileIndex);
          map[y][x] = selectedTileIndex;
          changedCells++;
        }
      }
    }
  }
  
  // Save the batch of changes
  if (pendingTileChanges.length > 0) {
    savePendingTileChanges();
  }
  
  // Clear selection after filling
  clearSelection();
  
  // Show feedback
  // if (changedCells > 0) {
  //   alert(`Filled ${changedCells} cells with tile ${selectedTileIndex}`);
  // } else {
  //   alert('No changes made - area already contains the selected tile.');
  // }
}

// Clear selection rectangle
function clearSelection() {
  selectionRect.startX = -1;
  selectionRect.startY = -1;
  selectionRect.endX = -1;
  selectionRect.endY = -1;
  selectionRect.isSelecting = false;
  $('#selectionInfo').removeClass('show');
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