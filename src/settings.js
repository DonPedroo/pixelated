export const BRAND_COLORS = {
    Red: "#EE2739",
    Red2: "#CC353C",
    Red3: "#7E2E40",
    Red4: "#DA8979",
    Red5: "#FF7701",

    Black: "#010101",
    Black2: "#211F1F",
    Black3: "#412123",
    Black4: "#784A4E",
    Black5: "#D9D3CC",

    Blue: "#384A68",
    Blue2: "#7695B3",
    Blue3: "#71C6E9",
    Blue4: "#BED7E8",
    Blue5: "#EAE9E9",
};

/**
 * Themes are now extracted into standalone JSON files in the ./themes directory.
 * This file dynamically imports them to keep the main settings file lean.
 */
const themeFiles = import.meta.glob('./themes/*.json', { eager: true });
export const themes = {};

for (const path in themeFiles) {
    const filename = path.split('/').pop().replace('.json', '');
    // Convert '2026-03-03_11_32_34' back to '2026-03-03 11:32:34'
    const key = filename.replace(/^(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})$/, '$1 $2:$3:$4');

    // In Vite, eager JSON imports are the object itself
    // If the JSON was imported via glob, it might have a .default property depending on Vite version/config
    themes[key] = themeFiles[path].default || themeFiles[path];
}

export const defaultThemeName = Object.keys(themes).sort()[0] || '';
