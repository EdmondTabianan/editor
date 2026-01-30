export const CANVAS_SIZES = {
    '16x16': { width: 16, height: 16 },
    '32x16': { width: 32, height: 16 },
    '16x32': { width: 16, height: 32 },
    '32x32': { width: 32, height: 32 }
};

export const DEFAULT_SIZE = '16x16';
export const PIXEL_SIZE = 16;
export const CANVAS_SCALE = 16;
export const CANVAS_SIZE = PIXEL_SIZE * CANVAS_SCALE;

// Editor Constants
export const MAX_FRAMES = 20;
export const MAX_COLORS = 64;
export const STORAGE_KEY = 'spriteEditorState';
export const VERSION = '1.3';

// Default palette
export const DEFAULT_PALETTE = [
    null, // index 0 is transparent
    '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#FF8800', '#8800FF',
    '#0088FF', '#88FF00', '#FF0088', '#888888', '#444444',
    '#888800', '#008888', '#880088', '#AA5500', '#5500AA'
];

export const TRANSPARENT_COLOR = null;