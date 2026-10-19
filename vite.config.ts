import {defineConfig} from 'vite';
// A per-build stamp versions the model URL so browsers never mix a cached older island.glb with new code.
const build = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
export default defineConfig({base:'./',define:{__BUILD_ID__:JSON.stringify(build)},build:{rollupOptions:{output:{manualChunks:{three:['three']}}}}});
