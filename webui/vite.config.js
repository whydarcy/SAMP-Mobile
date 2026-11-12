import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
export default defineConfig({plugins:[vue()],base:'/assets/webui/',build:{outDir:'../app/src/main/assets/webui',emptyOutDir:true,target:['chrome70','safari15'],assetsInlineLimit:0,rollupOptions:{external:['/assets/sile-cache/assets/index.js'],input:{main:fileURLToPath(new URL('./index.html',import.meta.url)),sile:fileURLToPath(new URL('./sile/index.html',import.meta.url))}}}});
