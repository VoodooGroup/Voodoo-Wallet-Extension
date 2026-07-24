import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { wallpaperUrl } from '../lib/assets';
import { applyFullscreenMode } from '../lib/fullscreen';
import { applyTheme, DEFAULT_THEME } from '../lib/theme';
import './index.css';

applyTheme(DEFAULT_THEME);
document.documentElement.style.setProperty('--wallpaper-image', `url("${wallpaperUrl()}")`);
applyFullscreenMode();

ReactDOM.createRoot(document.getElementById('root')).render(<App />);