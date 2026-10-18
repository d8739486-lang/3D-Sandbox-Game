import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Относительные пути, необходимые для запуска внутри Electron file://
});
