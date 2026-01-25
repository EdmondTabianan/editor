// Constants
const CONFIG = {
    TILE_SIZE: 16,
    PREVIEW_TILES: 9,
    PREVIEW_SCALE: 3,
    STORAGE_KEY: 'terrainTileStyles'
};

// Special Colors - All as hex strings
const SPECIAL_COLORS = {
    foam: "#e8f4fc",
    shadowColor: "#464646",      // rgb(70, 70, 70)
    highlightColor: "#ffffeb",   // rgb(255, 255, 235)
    wetEdge: "#8f7a45"
};

// Utility Functions
const Utils = {
    hexToRgb(hex) {
        // Handle RGB objects
        if (typeof hex === 'object' && hex.r !== undefined && hex.g !== undefined && hex.b !== undefined) {
            return hex;
        }
        
        // Handle hex strings
        if (typeof hex === 'string' && hex.startsWith('#')) {
            const n = parseInt(hex.slice(1), 16);
            return {
                r: (n >> 16) & 255,
                g: (n >> 8) & 255,
                b: n & 255
            };
        }
        
        // Default fallback (black)
        console.warn('Invalid color format:', hex);
        return { r: 0, g: 0, b: 0 };
    },

    rgbToHex(r, g, b) {
        return "#" + [r, g, b]
            .map(v => Math.max(0, Math.min(255, Math.round(v)))
                .toString(16)
                .padStart(2, "0"))
            .join("");
    },

    rgbToHsl(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        
        if (max === min) {
            h = s = 0; // achromatic
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        
        return { h: h * 360, s, l };
    },

    mixColors(color1, color2, ratio) {
        const c1 = this.hexToRgb(color1);
        const c2 = this.hexToRgb(color2);
        const r = c1.r * (1 - ratio) + c2.r * ratio;
        const g = c1.g * (1 - ratio) + c2.g * ratio;
        const b = c1.b * (1 - ratio) + c2.b * ratio;
        return this.rgbToHex(r, g, b);
    },

    getRandomColor(palette) {
        return palette[Math.floor(Math.random() * palette.length)];
    },

    addVariation(color, amount, style = null) {
        const c = this.hexToRgb(color);
        
        let variation = (Math.random() - 0.5) * amount;
        
        // Use style texture patterns if available
        if (style && style.texture) {
            variation *= (0.5 + style.texture.grainSize);
        }
        
        return this.rgbToHex(
            Math.max(0, Math.min(255, c.r + variation)),
            Math.max(0, Math.min(255, c.g + variation)),
            Math.max(0, Math.min(255, c.b + variation))
        );
    },

    applyBrightnessContrast(color, brightness, contrast) {
        const c = this.hexToRgb(color);
        
        // Adjust brightness
        let r = c.r + (brightness - 128);
        let g = c.g + (brightness - 128);
        let b = c.b + (brightness - 128);
        
        // Adjust contrast
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        r = factor * (r - 128) + 128;
        g = factor * (g - 128) + 128;
        b = factor * (b - 128) + 128;
        
        return this.rgbToHex(
            Math.max(0, Math.min(255, r)),
            Math.max(0, Math.min(255, g)),
            Math.max(0, Math.min(255, b))
        );
    },

    getColorDistance(color1, color2) {
        const c1 = this.hexToRgb(color1);
        const c2 = this.hexToRgb(color2);
        return Math.sqrt(
            Math.pow(c1.r - c2.r, 2) +
            Math.pow(c1.g - c2.g, 2) +
            Math.pow(c1.b - c2.b, 2)
        );
    },

    findClosestColor(color, palette) {
        let closestColor = palette[0];
        let minDistance = Infinity;
        
        for (const paletteColor of palette) {
            const distance = this.getColorDistance(color, paletteColor);
            if (distance < minDistance) {
                minDistance = distance;
                closestColor = paletteColor;
            }
        }
        
        return closestColor;
    }
};

// Style Storage for Consistency - Simplified version
const StyleStorage = {
    currentStyle: null,

    init() {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.currentStyle = data.currentStyle || null;
            } catch (e) {
                console.error('Error parsing saved styles:', e);
                this.currentStyle = null;
            }
        }
    },

    save() {
        const data = {
            currentStyle: this.currentStyle,
            timestamp: Date.now()
        };
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
    },

    setStyle(styleData) {
        this.currentStyle = styleData;
        this.save();
    },

    getStyle() {
        return this.currentStyle;
    },

    clearStyle() {
        this.currentStyle = null;
        this.save();
    }
};

// Initialize style storage
StyleStorage.init();

// Current extracted style and reference data
let currentStyle = null;
let referenceImageData = null;
let referenceColorMap = null; // Stores color positions from reference

// Reference Image Handler
const loadReferenceImage = () => {
    const input = document.getElementById('imageUpload');
    const canvas = document.getElementById('referenceCanvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    if (input?.files?.[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                // Clear previous data
                referenceColorMap = null;
                
                // Scale image to fit canvas while maintaining aspect ratio
                const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
                const x = (canvas.width - img.width * scale) / 2;
                const y = (canvas.height - img.height * scale) / 2;
                
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
                
                // Extract image data for analysis
                referenceImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const styleSource = document.querySelector('#styleSource');
                if (styleSource) {
                    styleSource.textContent = 'Reference Image Loaded';
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
};

const extractStyleFromReference = () => {
    if (!referenceImageData) {
        alert('Please load a reference image first.');
        return;
    }

    const imageData = referenceImageData;
    const pixels = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    // Analyze colors and their positions from reference image
    const colorPositions = {
        sand: [],
        water: [],
        cliff: [],
        debris: [],
        foam: []
    };
    
    const colorFrequency = {};
    referenceColorMap = Array.from({ length: height }, () => Array(width).fill(null));
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = pixels[idx];
            const g = pixels[idx + 1];
            const b = pixels[idx + 2];
            const a = pixels[idx + 3];
            
            if (a > 128) { // Only consider opaque pixels
                const hex = Utils.rgbToHex(r, g, b);
                const hsl = Utils.rgbToHsl(r, g, b);
                const color = `${r},${g},${b}`;
                
                // Store color position
                referenceColorMap[y][x] = { hex, x, y };
                
                // Count frequency
                colorFrequency[color] = (colorFrequency[color] || 0) + 1;
                
                // Classify colors based on HSL values and store position
                if (hsl.s > 0.1) { // Not grayscale
                    if (hsl.l > 0.6 && hsl.s < 0.4) {
                        colorPositions.sand.push({ hex, x, y, brightness: hsl.l });
                    } else if (hsl.h > 180 && hsl.h < 240 && hsl.s > 0.3) {
                        colorPositions.water.push({ hex, x, y, brightness: hsl.l });
                    } else if (hsl.l < 0.4 && hsl.s < 0.3) {
                        colorPositions.cliff.push({ hex, x, y, brightness: hsl.l });
                    } else if (hsl.s > 0.5 && (hsl.h < 60 || hsl.h > 300)) {
                        colorPositions.debris.push({ hex, x, y, brightness: hsl.l });
                    } else if (hsl.l > 0.9 && hsl.s < 0.1) {
                        colorPositions.foam.push({ hex, x, y, brightness: hsl.l });
                    }
                }
            }
        }
    }
    
    // Extract color palettes and analyze patterns
    const colorGroups = {};
    const texturePatterns = analyzeTexturePatterns(imageData, colorPositions);
    
    // Convert position data to color palettes
    Object.keys(colorPositions).forEach(key => {
        if (colorPositions[key].length > 0) {
            // Extract unique colors from positions
            const uniqueColors = [...new Set(colorPositions[key].map(item => item.hex))];
            // Sort by brightness for better variation
            uniqueColors.sort((a, b) => {
                const hslA = Utils.rgbToHsl(...Object.values(Utils.hexToRgb(a)));
                const hslB = Utils.rgbToHsl(...Object.values(Utils.hexToRgb(b)));
                return hslA.l - hslB.l;
            });
            colorGroups[key] = uniqueColors;
        }
    });
    
    // Ensure we have at least some colors in each category
    const defaultColors = {
        sand: ['#f5e6c4', '#e6d3a3', '#d9c08b'],
        water: ['#5dade2', '#3498db', '#2980b9'],
        cliff: ['#8f7a45', '#766536', '#5d4f2b'],
        debris: ['#8a7f68', '#7d6b55', '#6a5c48'],
        foam: ['#e8f4fc', '#ffffff']
    };
    
    Object.keys(colorGroups).forEach(key => {
        if (colorGroups[key].length === 0) {
            colorGroups[key] = defaultColors[key] || ['#000000'];
        }
    });
    
    // Create enhanced style object with position data
    currentStyle = {
        colors: colorGroups,
        colorPositions: colorPositions,
        texture: texturePatterns,
        extractedFrom: 'reference',
        timestamp: Date.now(),
        brightness: calculateAverageBrightness(imageData),
        contrast: calculateContrast(imageData),
        referenceWidth: width,
        referenceHeight: height,
        colorDistribution: analyzeColorDistribution(colorPositions, width, height)
    };
    
    // Update UI
    const styleSource = document.querySelector('#styleSource');
    if (styleSource) {
        styleSource.textContent = 'Style Extracted from Reference';
    }
    
    // Show color samples
    showColorSamples(colorGroups);
    
    // Save style
    StyleStorage.setStyle(currentStyle);
    
    // Update style preview with extracted colors
    updateStylePreview(colorGroups);
    
    alert('Style extracted successfully! Reference colors and positions have been captured.');
};

const analyzeTexturePatterns = (imageData, colorPositions) => {
    const patterns = {
        grainSize: 0,
        patternRegularity: 0,
        edgeSharpness: 0,
        colorClustering: 0,
        gradientSmoothness: 0
    };
    
    const pixels = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    let edgeCount = 0;
    let variationSum = 0;
    let clusterScore = 0;
    let gradientScore = 0;
    
    // Analyze edges and variations
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            const brightness = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
            
            // Check surrounding pixels for variation
            let localVariation = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nIdx = ((y + dy) * width + (x + dx)) * 4;
                    const nBrightness = (pixels[nIdx] + pixels[nIdx + 1] + pixels[nIdx + 2]) / 3;
                    localVariation += Math.abs(brightness - nBrightness);
                }
            }
            
            variationSum += localVariation / 8;
            
            // Detect edges
            if (localVariation > 50) {
                edgeCount++;
            }
        }
    }
    
    // Analyze color clustering
    if (colorPositions.sand.length > 0) {
        clusterScore = analyzeColorClustering(colorPositions.sand);
    }
    
    // Analyze gradient smoothness
    gradientScore = analyzeGradientSmoothness(imageData);
    
    patterns.grainSize = Math.min(1, variationSum / (width * height * 10));
    patterns.edgeSharpness = Math.min(1, edgeCount / (width * height * 0.1));
    patterns.colorClustering = Math.min(1, clusterScore);
    patterns.gradientSmoothness = Math.min(1, gradientScore);
    
    return patterns;
};

const analyzeColorClustering = (colorPositions) => {
    if (colorPositions.length < 2) return 0;
    
    let totalDistance = 0;
    let count = 0;
    
    for (let i = 0; i < colorPositions.length; i++) {
        for (let j = i + 1; j < Math.min(i + 10, colorPositions.length); j++) {
            const dx = colorPositions[i].x - colorPositions[j].x;
            const dy = colorPositions[i].y - colorPositions[j].y;
            totalDistance += Math.sqrt(dx * dx + dy * dy);
            count++;
        }
    }
    
    const avgDistance = totalDistance / count;
    return Math.min(1, avgDistance / 100); // Normalize
};

const analyzeGradientSmoothness = (imageData) => {
    const pixels = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    let gradientSum = 0;
    let count = 0;
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            const brightness = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
            
            // Calculate gradient magnitude
            let gradient = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nIdx = ((y + dy) * width + (x + dx)) * 4;
                    const nBrightness = (pixels[nIdx] + pixels[nIdx + 1] + pixels[nIdx + 2]) / 3;
                    gradient += Math.abs(brightness - nBrightness);
                }
            }
            
            gradientSum += gradient / 8;
            count++;
        }
    }
    
    return Math.min(1, gradientSum / (count * 10));
};

const analyzeColorDistribution = (colorPositions, width, height) => {
    const distribution = {
        sand: { density: 0, spread: 0 },
        water: { density: 0, spread: 0 },
        cliff: { density: 0, spread: 0 },
        debris: { density: 0, spread: 0 },
        foam: { density: 0, spread: 0 }
    };
    
    Object.keys(colorPositions).forEach(key => {
        const positions = colorPositions[key];
        if (positions.length > 0) {
            // Calculate density
            distribution[key].density = positions.length / (width * height);
            
            // Calculate spread (variance of positions)
            if (positions.length > 1) {
                let sumX = 0, sumY = 0;
                positions.forEach(pos => {
                    sumX += pos.x;
                    sumY += pos.y;
                });
                const meanX = sumX / positions.length;
                const meanY = sumY / positions.length;
                
                let variance = 0;
                positions.forEach(pos => {
                    const dx = pos.x - meanX;
                    const dy = pos.y - meanY;
                    variance += (dx * dx + dy * dy);
                });
                distribution[key].spread = Math.sqrt(variance / positions.length) / Math.max(width, height);
            }
        }
    });
    
    return distribution;
};

const calculateAverageBrightness = (imageData) => {
    const pixels = imageData.data;
    let total = 0;
    let count = 0;
    
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] > 128) {
            total += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
            count++;
        }
    }
    
    return count > 0 ? total / count : 128;
};

const calculateContrast = (imageData) => {
    const pixels = imageData.data;
    let minBrightness = 255;
    let maxBrightness = 0;
    
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] > 128) {
            const brightness = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
            minBrightness = Math.min(minBrightness, brightness);
            maxBrightness = Math.max(maxBrightness, brightness);
        }
    }
    
    return maxBrightness - minBrightness;
};

const showColorSamples = (colorGroups) => {
    const container = document.getElementById('stylePreview');
    if (!container) return;
    
    container.innerHTML = '';
    
    Object.entries(colorGroups).forEach(([group, colors]) => {
        if (colors.length > 0) {
            // Create a container for this color group
            const groupContainer = document.createElement('div');
            groupContainer.style.cssText = `
                display: inline-block;
                margin: 5px;
                text-align: center;
            `;
            
            // Add group label
            const label = document.createElement('div');
            label.textContent = group;
            label.style.cssText = `
                font-size: 10px;
                color: #888;
                margin-bottom: 2px;
            `;
            groupContainer.appendChild(label);
            
            // Add color samples
            colors.slice(0, 3).forEach((color, index) => {
                const sample = document.createElement('div');
                sample.style.cssText = `
                    display: inline-block;
                    width: 16px;
                    height: 16px;
                    background: ${color};
                    border: 1px solid #444;
                    margin: 1px;
                    cursor: pointer;
                    position: relative;
                `;
                sample.title = `${group}: ${color}`;
                
                sample.addEventListener('click', () => {
                    alert(`${group} colors (${colors.length} total):\n${colors.join('\n')}`);
                });
                
                groupContainer.appendChild(sample);
            });
            
            if (colors.length > 3) {
                const more = document.createElement('div');
                more.textContent = `+${colors.length - 3}`;
                more.style.cssText = `
                    font-size: 9px;
                    color: #aaa;
                    margin-top: 2px;
                `;
                groupContainer.appendChild(more);
            }
            
            container.appendChild(groupContainer);
        }
    });
};

const updateStylePreview = (colorGroups) => {
    const container = document.getElementById('stylePreview');
    if (!container) return;
    
    // Create a preview canvas showing the color distribution
    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = 64;
    previewCanvas.height = 64;
    previewCanvas.style.cssText = `
        width: 64px;
        height: 64px;
        image-rendering: pixelated;
        border: 1px solid #444;
        margin: 10px auto;
        display: block;
    `;
    
    const ctx = previewCanvas.getContext('2d');
    
    // Draw color distribution based on reference patterns
    if (currentStyle?.colorPositions) {
        const positions = currentStyle.colorPositions;
        Object.keys(positions).forEach((group, groupIndex) => {
            const groupPositions = positions[group];
            if (groupPositions.length > 0) {
                // Map reference positions to preview canvas
                groupPositions.forEach(pos => {
                    const x = (pos.x / currentStyle.referenceWidth) * 64;
                    const y = (pos.y / currentStyle.referenceHeight) * 64;
                    ctx.fillStyle = pos.hex;
                    ctx.fillRect(x, y, 2, 2);
                });
            }
        });
    }
    
    container.appendChild(previewCanvas);
};

// Terrain Generator with Style Reference
const TerrainGenerator = {
    canvas: document.getElementById('tile'),
    ctx: null,
    preview: document.getElementById('preview'),
    previewCtx: null,
    currentPixels: null,
    currentStyle: null,

    init() {
        this.ctx = this.canvas?.getContext('2d', { willReadFrequently: true });
        if (this.ctx) {
            this.ctx.imageSmoothingEnabled = false;
        }
        
        this.previewCtx = this.preview?.getContext('2d', { willReadFrequently: true });
        if (this.previewCtx) {
            this.previewCtx.imageSmoothingEnabled = false;
        }
        
        this.setupEventListeners();
        this.updateFeatureIndicator();
        
        // Load default style or from storage
        this.loadDefaultStyle();
        
        this.generateTile();
    },

    setupEventListeners() {
        // Add event listeners for reference image controls
        const imageUpload = document.getElementById('imageUpload');
        if (imageUpload) {
            imageUpload.addEventListener('change', loadReferenceImage);
        }
    },

    loadDefaultStyle() {
        // Default style if no reference loaded
        this.currentStyle = {
            colors: {
                sand: ['#f5e6c4', '#e6d3a3', '#d9c08b', '#cbb279', '#bfa56a'],
                water: ['#5dade2', '#3498db', '#2980b9', '#1c5a7a', '#154360'],
                cliff: ['#8f7a45', '#766536', '#5d4f2b', '#4a3f22'],
                debris: ['#8a7f68', '#7d6b55', '#6a5c48', '#5d4f2b'],
                foam: ['#e8f4fc', '#ffffff']
            },
            texture: {
                grainSize: 0.3,
                patternRegularity: 0.5,
                edgeSharpness: 0.7,
                colorClustering: 0.4,
                gradientSmoothness: 0.6
            },
            brightness: 128,
            contrast: 100
        };
    },

    updateFeatureIndicator() {
        const styleSource = document.querySelector('#styleSource')?.textContent || 'Default Style';
        const featureIndicator = document.querySelector('#featureIndicator');
        if (featureIndicator) {
            featureIndicator.textContent = `Using ${styleSource}`;
        }
    },

    generateTile() {
        try {
            // Get parameters
            const tileName = document.querySelector('#tileName')?.value || "terrain_tile";
            const lightDir = document.querySelector('#lightDir')?.value || 'top-left';
            const lightIntensity = document.querySelector('#lightIntensity')?.value || 'medium';
            const realismLevel = document.querySelector('#realismLevel')?.value || 'medium';
            const useReferenceStyle = document.querySelector('#useReferenceStyle')?.checked || false;
            const addEnvironmentalDetails = document.querySelector('#addEnvironmentalDetails')?.checked || true;
            const enhanceVariation = document.querySelector('#enhanceVariation')?.checked || true;

            // Update UI
            const currentTileName = document.querySelector('#currentTileName');
            if (currentTileName) {
                currentTileName.textContent = tileName;
            }

            // Use current style or reference if available
            let style = this.currentStyle;
            if (useReferenceStyle && currentStyle) {
                style = currentStyle;
                const styleSource = document.querySelector('#styleSource');
                if (styleSource) {
                    styleSource.textContent = 'Reference Style';
                }
            } else if (useReferenceStyle) {
                const savedStyle = StyleStorage.getStyle();
                if (savedStyle) {
                    style = savedStyle;
                    const styleSource = document.querySelector('#styleSource');
                    if (styleSource) {
                        styleSource.textContent = 'Saved Style';
                    }
                }
            }

            // Generate mask using reference color positions if available
            const mask = this.generateMaskFromReference(style);

            // Generate base colors with style
            const pixels = this.generateBaseColorsWithStyle(mask, style, realismLevel);

            // Add enhanced environmental details
            this.addEnhancedEnvironmentalDetails(pixels, mask, style, enhanceVariation);

            // Apply lighting with reference patterns
            this.applyLightingWithReference(pixels, mask, lightDir, lightIntensity, style);

            // Ensure seamless tiling
            this.makeSeamless(pixels);

            // Add final details and polish
            this.addFinalDetails(pixels, mask, style);

            // Store and draw
            this.currentPixels = pixels;
            this.drawTile(pixels);
            this.drawPreview(pixels);

            this.updateFeatureIndicator();

        } catch (error) {
            console.error('Error generating tile:', error);
            alert('Error generating tile. Please check console for details.');
        }
    },

    generateMaskFromReference(style) {
        const mask = Array.from({ length: CONFIG.TILE_SIZE }, 
            () => Array(CONFIG.TILE_SIZE).fill(0)); // 0 = sand, 1 = water, 2 = cliff
        
        // If we have reference color positions, use them to create patterns
        if (style?.colorPositions) {
            const positions = style.colorPositions;
            
            // Calculate dominant terrain type based on reference
            const terrainCounts = {
                sand: positions.sand?.length || 0,
                water: positions.water?.length || 0,
                cliff: positions.cliff?.length || 0
            };
            
            // Find dominant terrain
            const dominantTerrain = Object.keys(terrainCounts).reduce((a, b) => 
                terrainCounts[a] > terrainCounts[b] ? a : b
            );
            
            // Create mask based on reference patterns
            for (let y = 0; y < CONFIG.TILE_SIZE; y++) {
                for (let x = 0; x < CONFIG.TILE_SIZE; x++) {
                    // Map tile position to reference position
                    const refX = (x / CONFIG.TILE_SIZE) * (style.referenceWidth || 64);
                    const refY = (y / CONFIG.TILE_SIZE) * (style.referenceHeight || 64);
                    
                    // Simulate reference patterns
                    let terrainType = 0; // Default to sand
                    
                    // Create patterns based on reference color distribution
                    if (style.colorDistribution) {
                        const noise = Math.sin(x * 0.5) * Math.cos(y * 0.5) * 0.5 + 0.5;
                        
                        if (dominantTerrain === 'water' && noise > 0.7) {
                            terrainType = 1; // Water
                        } else if (dominantTerrain === 'cliff' && noise > 0.6) {
                            terrainType = 2; // Cliff
                        } else if (noise > 0.8) {
                            terrainType = 1; // Water patches
                        } else if (noise > 0.65) {
                            terrainType = 2; // Cliff patches
                        }
                    } else {
                        // Fallback to simple pattern
                        const distance = Math.sqrt(
                            Math.pow(x - CONFIG.TILE_SIZE/2, 2) + 
                            Math.pow(y - CONFIG.TILE_SIZE/2, 2)
                        );
                        
                        if (distance < 4) {
                            terrainType = 1; // Water in center
                        } else if (distance < 6) {
                            terrainType = 2; // Cliff ring
                        }
                    }
                    
                    mask[y][x] = terrainType;
                }
            }
        } else {
            // Fallback to simple pattern
            this.generateSimpleMask(mask);
        }
        
        return mask;
    },

    generateSimpleMask(mask) {
        // Add some water in the center
        const centerX = Math.floor(CONFIG.TILE_SIZE / 2);
        const centerY = Math.floor(CONFIG.TILE_SIZE / 2);
        const radius = 4;
        
        for (let y = 0; y < CONFIG.TILE_SIZE; y++) {
            for (let x = 0; x < CONFIG.TILE_SIZE; x++) {
                const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
                if (distance < radius) {
                    mask[y][x] = 1; // Water
                } else if (distance < radius + 2) {
                    mask[y][x] = 2; // Cliff
                }
            }
        }
    },

    generateBaseColorsWithStyle(mask, style, realismLevel) {
        const pixels = [];
        const variation = realismLevel === "low" ? 5 : realismLevel === "medium" ? 10 : 15;
        
        for (let y = 0; y < CONFIG.TILE_SIZE; y++) {
            for (let x = 0; x < CONFIG.TILE_SIZE; x++) {
                let color;
                
                switch (mask[y][x]) {
                    case 0: // Sand
                        const sandColors = style.colors.sand || ['#f5e6c4'];
                        color = this.getColorWithPosition(x, y, sandColors, style, 'sand');
                        if (realismLevel !== "low") {
                            color = Utils.addVariation(color, variation, style);
                        }
                        break;
                        
                    case 1: // Water
                        const waterColors = style.colors.water || ['#5dade2'];
                        color = this.getColorWithPosition(x, y, waterColors, style, 'water');
                        if (realismLevel !== "low") {
                            color = Utils.addVariation(color, variation * 0.8, style);
                        }
                        break;
                        
                    case 2: // Cliff
                        const cliffColors = style.colors.cliff || ['#8f7a45'];
                        color = this.getColorWithPosition(x, y, cliffColors, style, 'cliff');
                        if (realismLevel !== "low") {
                            color = Utils.addVariation(color, variation * 1.2, style);
                        }
                        break;
                        
                    default:
                        color = '#000000';
                }
                
                pixels.push(color);
            }
        }
        
        return pixels;
    },

    getColorWithPosition(x, y, colors, style, terrainType) {
        if (!style?.colorPositions?.[terrainType] || style.colorPositions[terrainType].length === 0) {
            return Utils.getRandomColor(colors);
        }
        
        // Map tile position to reference position
        const refX = (x / CONFIG.TILE_SIZE) * (style.referenceWidth || 64);
        const refY = (y / CONFIG.TILE_SIZE) * (style.referenceHeight || 64);
        
        // Find closest position in reference
        const positions = style.colorPositions[terrainType];
        let closestPos = positions[0];
        let minDistance = Infinity;
        
        for (const pos of positions) {
            const distance = Math.sqrt(
                Math.pow(pos.x - refX, 2) + Math.pow(pos.y - refY, 2)
            );
            if (distance < minDistance) {
                minDistance = distance;
                closestPos = pos;
            }
        }
        
        // Use color from closest position or random if not found
        return closestPos?.hex || Utils.getRandomColor(colors);
    },

    addEnhancedEnvironmentalDetails(pixels, mask, style, enhanceVariation) {
        const foamColor = style.colors.foam?.[0] || SPECIAL_COLORS.foam;
        const wetEdgeColor = SPECIAL_COLORS.wetEdge;
        const variationFactor = enhanceVariation ? 1.5 : 1.0;
        
        for (let y = 0; y < CONFIG.TILE_SIZE; y++) {
            for (let x = 0; x < CONFIG.TILE_SIZE; x++) {
                const idx = y * CONFIG.TILE_SIZE + x;
                
                // Enhanced foam at water edges
                if (mask[y][x] === 1) { // Water
                    let edgeCount = 0;
                    
                    // Check all neighbors
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (dx === 0 && dy === 0) continue;
                            const ny = y + dy;
                            const nx = x + dx;
                            if (ny >= 0 && ny < CONFIG.TILE_SIZE && nx >= 0 && nx < CONFIG.TILE_SIZE) {
                                if (mask[ny][nx] === 0 || mask[ny][nx] === 2) {
                                    edgeCount++;
                                }
                            }
                        }
                    }
                    
                    // Add foam based on edge density
                    if (edgeCount > 0 && Math.random() < (0.1 + edgeCount * 0.05) * variationFactor) {
                        // Vary foam color slightly
                        const foamVariation = Utils.addVariation(foamColor, 10);
                        pixels[idx] = foamVariation;
                    }
                }
                
                // Enhanced wet edge effect
                if (mask[y][x] === 2) { // Cliff
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const ny = y + dy;
                            const nx = x + dx;
                            if (ny >= 0 && ny < CONFIG.TILE_SIZE && nx >= 0 && nx < CONFIG.TILE_SIZE) {
                                if (mask[ny][nx] === 1) { // Adjacent water
                                    if (Math.random() < 0.4 * variationFactor) {
                                        // Create gradient wet effect
                                        const wetRatio = 0.2 + Math.random() * 0.3;
                                        pixels[idx] = Utils.mixColors(pixels[idx], wetEdgeColor, wetRatio);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Enhanced debris with variation
                if (mask[y][x] === 0 && Math.random() < 0.08 * variationFactor) {
                    const debrisColors = style.colors.debris || ['#8a7f68'];
                    const debrisColor = Utils.getRandomColor(debrisColors);
                    // Add some size variation to debris
                    const debrisSize = Math.random() > 0.7 ? 2 : 1;
                    for (let dy = 0; dy < debrisSize; dy++) {
                        for (let dx = 0; dx < debrisSize; dx++) {
                            const ny = y + dy;
                            const nx = x + dx;
                            if (ny < CONFIG.TILE_SIZE && nx < CONFIG.TILE_SIZE) {
                                const nIdx = ny * CONFIG.TILE_SIZE + nx;
                                pixels[nIdx] = Utils.mixColors(pixels[nIdx], debrisColor, 0.7);
                            }
                        }
                    }
                }
            }
        }
    },

    applyLightingWithReference(pixels, mask, lightDir, lightIntensity, style) {
        const intensityMap = {
            'soft': 0.3,
            'medium': 0.5,
            'strong': 0.7
        };
        const intensity = intensityMap[lightIntensity] || 0.5;
        
        for (let y = 0; y < CONFIG.TILE_SIZE; y++) {
            for (let x = 0; x < CONFIG.TILE_SIZE; x++) {
                const idx = y * CONFIG.TILE_SIZE + x;
                
                // Calculate light factor based on position and direction
                let lightFactor = 1.0;
                
                switch (lightDir) {
                    case 'top-left':
                        lightFactor = 1 + ((CONFIG.TILE_SIZE - x - y) / (CONFIG.TILE_SIZE * 2)) * intensity;
                        break;
                    case 'top-right':
                        lightFactor = 1 + ((x - y) / (CONFIG.TILE_SIZE * 2)) * intensity;
                        break;
                    case 'diagonal':
                        lightFactor = 1 + ((Math.abs(x - y)) / CONFIG.TILE_SIZE) * intensity * 0.5;
                        break;
                }
                
                // Enhanced terrain-specific lighting
                if (mask[y][x] === 2) { // Cliff - dramatic lighting with texture
                    lightFactor *= 1.2 + Math.sin(x * 0.5 + y * 0.3) * 0.1;
                } else if (mask[y][x] === 1) { // Water - subtle, wavy lighting
                    lightFactor *= 0.9 + Math.sin(x * 0.3 + y * 0.4) * 0.05;
                } else { // Sand - natural variation
                    lightFactor *= 1.0 + Math.sin(x * 0.4 + y * 0.2) * 0.05;
                }
                
                // Apply lighting
                const originalColor = Utils.hexToRgb(pixels[idx]);
                const litColor = {
                    r: Math.min(255, Math.max(0, originalColor.r * lightFactor)),
                    g: Math.min(255, Math.max(0, originalColor.g * lightFactor)),
                    b: Math.min(255, Math.max(0, originalColor.b * lightFactor))
                };
                
                pixels[idx] = Utils.rgbToHex(litColor.r, litColor.g, litColor.b);
                
                // Apply style brightness/contrast if available
                if (style?.brightness && style?.contrast) {
                    pixels[idx] = Utils.applyBrightnessContrast(
                        pixels[idx], 
                        style.brightness, 
                        style.contrast
                    );
                }
            }
        }
    },

    makeSeamless(pixels) {
        // Ensure edges match for seamless tiling
        const size = CONFIG.TILE_SIZE;
        
        // Average edge colors with smoothing
        for (let i = 0; i < size; i++) {
            // Top edge matches bottom edge
            const topIdx = i;
            const bottomIdx = (size - 1) * size + i;
            const avgColor = this.averageColorsWithSmoothing(pixels[topIdx], pixels[bottomIdx]);
            pixels[topIdx] = avgColor;
            pixels[bottomIdx] = avgColor;
            
            // Left edge matches right edge
            const leftIdx = i * size;
            const rightIdx = i * size + (size - 1);
            const avgColor2 = this.averageColorsWithSmoothing(pixels[leftIdx], pixels[rightIdx]);
            pixels[leftIdx] = avgColor2;
            pixels[rightIdx] = avgColor2;
        }
        
        // Enhanced corner blending with gradient
        const corners = [
            0, // top-left
            size - 1, // top-right
            (size - 1) * size, // bottom-left
            (size - 1) * size + (size - 1) // bottom-right
        ];
        
        const avgCornerColor = this.averageColorsWithSmoothing(
            this.averageColorsWithSmoothing(pixels[corners[0]], pixels[corners[1]]),
            this.averageColorsWithSmoothing(pixels[corners[2]], pixels[corners[3]])
        );
        
        corners.forEach(idx => {
            pixels[idx] = avgCornerColor;
        });
    },

    averageColorsWithSmoothing(color1, color2) {
        const c1 = Utils.hexToRgb(color1);
        const c2 = Utils.hexToRgb(color2);
        
        // Add slight random variation to avoid banding
        const variation = (Math.random() - 0.5) * 5;
        
        return Utils.rgbToHex(
            Math.round((c1.r + c2.r) / 2 + variation),
            Math.round((c1.g + c2.g) / 2 + variation),
            Math.round((c1.b + c2.b) / 2 + variation)
        );
    },

    addFinalDetails(pixels, mask, style) {
        // Add subtle noise for texture
        for (let i = 0; i < pixels.length; i++) {
            const variation = (Math.random() - 0.5) * 3;
            const color = Utils.hexToRgb(pixels[i]);
            pixels[i] = Utils.rgbToHex(
                Math.max(0, Math.min(255, color.r + variation)),
                Math.max(0, Math.min(255, color.g + variation)),
                Math.max(0, Math.min(255, color.b + variation))
            );
        }
        
        // Add highlights on water using hex string
        for (let y = 0; y < CONFIG.TILE_SIZE; y++) {
            for (let x = 0; x < CONFIG.TILE_SIZE; x++) {
                if (mask[y][x] === 1 && Math.random() < 0.1) {
                    const idx = y * CONFIG.TILE_SIZE + x;
                    pixels[idx] = Utils.mixColors(pixels[idx], SPECIAL_COLORS.highlightColor, 0.1);
                }
            }
        }
    },

    drawTile(pixels) {
        if (!this.ctx) return;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const scale = 3; // 16x16 scaled to 48x48
        
        for (let y = 0; y < CONFIG.TILE_SIZE; y++) {
            for (let x = 0; x < CONFIG.TILE_SIZE; x++) {
                const idx = y * CONFIG.TILE_SIZE + x;
                this.ctx.fillStyle = pixels[idx];
                this.ctx.fillRect(x * scale, y * scale, scale, scale);
            }
        }
    },

    drawPreview(pixels) {
        if (!this.previewCtx) return;
        
        this.previewCtx.clearRect(0, 0, this.preview.width, this.preview.height);
        
        const gridSize = CONFIG.PREVIEW_TILES;
        const scale = CONFIG.PREVIEW_SCALE;
        
        for (let gridY = 0; gridY < gridSize; gridY++) {
            for (let gridX = 0; gridX < gridSize; gridX++) {
                // Add slight variation to each tile instance
                const variedPixels = this.addTileVariation(pixels, gridX + gridY);
                
                for (let y = 0; y < CONFIG.TILE_SIZE; y++) {
                    for (let x = 0; x < CONFIG.TILE_SIZE; x++) {
                        const idx = y * CONFIG.TILE_SIZE + x;
                        this.previewCtx.fillStyle = variedPixels[idx];
                        this.previewCtx.fillRect(
                            gridX * CONFIG.TILE_SIZE * scale + x * scale,
                            gridY * CONFIG.TILE_SIZE * scale + y * scale,
                            scale, scale
                        );
                    }
                }
            }
        }
    },

    addTileVariation(pixels, seed) {
        const varied = [...pixels];
        const rng = (seed * 9301 + 49297) % 233280;
        const variation = (rng % 15) / 100; // Slightly more variation
        
        for (let i = 0; i < varied.length; i++) {
            const color = Utils.hexToRgb(varied[i]);
            varied[i] = Utils.rgbToHex(
                Math.min(255, Math.max(0, color.r * (1 + (Math.random() - 0.5) * 0.05 + variation))),
                Math.min(255, Math.max(0, color.g * (1 + (Math.random() - 0.5) * 0.05 + variation))),
                Math.min(255, Math.max(0, color.b * (1 + (Math.random() - 0.5) * 0.05 + variation)))
            );
        }
        
        return varied;
    },

    savePNG() {
        if (!this.currentPixels) {
            alert('Please generate a tile first.');
            return;
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = CONFIG.TILE_SIZE;
        canvas.height = CONFIG.TILE_SIZE;
        const ctx = canvas.getContext('2d');
        
        for (let y = 0; y < CONFIG.TILE_SIZE; y++) {
            for (let x = 0; x < CONFIG.TILE_SIZE; x++) {
                const idx = y * CONFIG.TILE_SIZE + x;
                ctx.fillStyle = this.currentPixels[idx];
                ctx.fillRect(x, y, 1, 1);
            }
        }
        
        const tileName = document.querySelector('#tileName')?.value || "terrain_tile";
        const styleSource = document.querySelector('#styleSource')?.textContent || 'custom';
        const link = document.createElement('a');
        link.download = `${tileName}_${styleSource.replace(/[^a-z0-9]/gi, '_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }
};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the generator
    TerrainGenerator.init();
    
    // Generate initial tile
    TerrainGenerator.generateTile();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl+G or Cmd+G to generate
    if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        TerrainGenerator.generateTile();
    }
    // Ctrl+S or Cmd+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        TerrainGenerator.savePNG();
    }
});

// Export functions for global use
window.TerrainGenerator = TerrainGenerator;
window.StyleStorage = StyleStorage;
window.Utils = Utils;
window.loadReferenceImage = loadReferenceImage;
window.extractStyleFromReference = extractStyleFromReference;