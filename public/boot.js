// Entry point for the popup and the settings page.
// Kept in its own file because MV3 blocks inline <script> on extension pages,
// so the markup is rendered first and app.js is imported afterwards: app.js
// reads its DOM nodes at module scope and needs the shell to exist already.
import { renderShell } from './ui.js';

renderShell();
await import('./app.js');
