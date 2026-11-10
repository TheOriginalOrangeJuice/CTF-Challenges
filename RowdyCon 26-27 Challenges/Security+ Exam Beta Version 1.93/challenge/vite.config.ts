import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({root:'client',plugins:[react()],publicDir:'../public',build:{outDir:'../dist/public',emptyOutDir:true,sourcemap:false}});
