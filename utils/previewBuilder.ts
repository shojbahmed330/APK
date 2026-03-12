import { transform } from 'sucrase';

const normalizePath = (value: string): string => {
  const parts = value.split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join('/');
};

const rewriteRelativeImports = (code: string, filePath: string): string => {
  const baseDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';

  const rewrite = (specifier: string) => {
    let resolved = specifier;
    if (specifier.startsWith('/')) {
      resolved = specifier.slice(1);
    } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
      resolved = normalizePath([baseDir, specifier].filter(Boolean).join('/'));
    } else {
      return specifier;
    }
    return resolved.replace(/\.(ts|tsx|js|jsx)$/, '');
  };

  return code
    .replace(/(import\s*['"])([^'"]+)(['"])/g, (_m, a, b, c) => `${a}${rewrite(b)}${c}`)
    .replace(/((?:import|export)\s+[^"']*from\s*['"])([^'"]+)(['"])/g, (_m, a, b, c) => `${a}${rewrite(b)}${c}`)
    .replace(/(import\s*\(\s*['"])([^'"]+)(['"]\s*\))/g, (_m, a, b, c) => `${a}${rewrite(b)}${c}`);
};

export const buildFinalHtml = (projectFiles: Record<string, string>, entryPath: string = 'index.html', projectConfig?: any, useDataUri: boolean = false) => {
  try {
    const supabaseConfig = projectConfig?.supabase_url ? `
      window.StudioDatabase = {
        url: "${projectConfig.supabase_url}",
        key: "${projectConfig.supabase_key}"
      };
      console.log('Database Bridge: Active');
    ` : `window.StudioDatabase = null;`;

    const polyfill = `
      <script>
        ${supabaseConfig}
        // Mobile Error Monitor
        window.onerror = function(message, source, lineno, colno, error) {
          const errorMsg = 'SYSTEM_ERROR: ' + message + ' at ' + (source ? source.split('/').pop() : 'inline') + ':' + lineno;
          console.error(errorMsg);
          if (window.innerHeight < 1000) {
             const div = document.createElement('div');
             div.style = "position:fixed;bottom:0;left:0;right:0;background:rgba(220,38,38,0.9);color:white;padding:10px;font-size:10px;z-index:99999;font-family:monospace;word-break:break-all;";
             div.innerText = errorMsg;
             document.body.appendChild(div);
             setTimeout(() => div.remove(), 8000);
          }
          window.parent.postMessage({
            type: 'RUNTIME_ERROR',
            error: { message, line: lineno, source: source ? source.split('/').pop() : 'index.html' }
          }, '*');
          return false;
        };

        window.addEventListener('load', function() {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              window.parent.postMessage({ type: 'PREVIEW_RENDER_OK' }, '*');
            });
          });
        });

        if ('scrollRestoration' in history) { history.scrollRestoration = 'manual'; }
      </script>
    `;

    // Identify workspaces
    const isAppWorkspace = entryPath.startsWith('app/') || entryPath === 'index.html' || entryPath === 'app.html';
    const isAdminWorkspace = entryPath.startsWith('admin/') || entryPath === 'admin.html';

    // Process Files
    const transpiledFiles: Record<string, string> = {};
    const cssFiles: string[] = [];
    
    Object.entries(projectFiles).forEach(([path, content]) => {
      if (!content) return;
      
      // Filter by workspace
      if (isAppWorkspace && (path.startsWith('admin/') || path.startsWith('admin.'))) return;
      if (isAdminWorkspace && (path.startsWith('app/') || path.startsWith('app.'))) return;

      if (path.endsWith('.css')) {
        cssFiles.push(`/* --- ${path} --- */\n${content}`);
        transpiledFiles[path] = "export default {};";
      } else if (path.endsWith('.json')) {
        transpiledFiles[path] = `export default ${content};`;
      } else if (path.endsWith('.js') || path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.jsx')) {
        try {
          const transpiled = transform(content, {
            // Keep ESM imports for the browser runtime.
            // Using the `imports` transform rewrites imports to CommonJS `require(...)`,
            // which causes `Uncaught ReferenceError: require is not defined` in preview.
            transforms: ['typescript', 'jsx'],
            jsxRuntime: 'automatic',
            production: true
          }).code;
          const rewrittenImports = rewriteRelativeImports(transpiled, path);
          const rewritten = rewrittenImports
            .replace(/\bimport\.meta\.env\b/g, 'window.__STUDIO_ENV__');

          const cleanPath = path.replace(/\.(ts|tsx|js|jsx)$/, '');
          transpiledFiles[cleanPath] = rewritten;
          transpiledFiles[path] = rewritten;
        } catch (e) {
          console.error(`Transpilation error in ${path}:`, e);
          transpiledFiles[path] = `console.error("Transpilation error in ${path}");`;
        }
      }
    });

    // Build Import Map
    const importMap: Record<string, string> = {
      // ✅ Workspace path aliases (for generated absolute-like imports)
      "app/": "/app/",
      "admin/": "/admin/",
      "src/": "/src/",
      "@/": "/app/",

      // ✅ React Core
      "react": "https://esm.sh/react@19.0.0",
      "react/jsx-runtime": "https://esm.sh/react@19.0.0/jsx-runtime",
      "react/jsx-dev-runtime": "https://esm.sh/react@19.0.0/jsx-dev-runtime",
      "react-dom": "https://esm.sh/react-dom@19.0.0",
      "react-dom/client": "https://esm.sh/react-dom@19.0.0/client",
      "react-dom/server": "https://esm.sh/react-dom@19.0.0/server",

      // ✅ Routing
      "react-router": "https://esm.sh/react-router@6.28.0",
      "react-router-dom": "https://esm.sh/react-router-dom@6.28.0",

      // ✅ UI Icons
      "lucide-react": "https://esm.sh/lucide-react@0.511.0",
      "react-icons": "https://esm.sh/react-icons@5.4.0",
      "react-icons/fa": "https://esm.sh/react-icons@5.4.0/fa",
      "react-icons/fi": "https://esm.sh/react-icons@5.4.0/fi",
      "react-icons/md": "https://esm.sh/react-icons@5.4.0/md",
      "react-icons/io": "https://esm.sh/react-icons@5.4.0/io",
      "react-icons/ai": "https://esm.sh/react-icons@5.4.0/ai",
      "react-icons/bi": "https://esm.sh/react-icons@5.4.0/bi",
      "react-icons/bs": "https://esm.sh/react-icons@5.4.0/bs",
      "react-icons/hi": "https://esm.sh/react-icons@5.4.0/hi",
      "react-icons/si": "https://esm.sh/react-icons@5.4.0/si",
      "react-icons/ri": "https://esm.sh/react-icons@5.4.0/ri",
      "@heroicons/react": "https://esm.sh/@heroicons/react@2.2.0",
      "@heroicons/react/24/outline": "https://esm.sh/@heroicons/react@2.2.0/24/outline",
      "@heroicons/react/24/solid": "https://esm.sh/@heroicons/react@2.2.0/24/solid",
      "@heroicons/react/20/solid": "https://esm.sh/@heroicons/react@2.2.0/20/solid",

      // ✅ Animation
      "framer-motion": "https://esm.sh/framer-motion@11.11.11",
      "react-spring": "https://esm.sh/react-spring@9.7.5",
      "@react-spring/web": "https://esm.sh/@react-spring/web@9.7.5",
      "gsap": "https://esm.sh/gsap@3.12.5",
      "lottie-react": "https://esm.sh/lottie-react@2.4.0",
      "auto-animate": "https://esm.sh/@formkit/auto-animate@0.8.2",

      // ✅ Charts & Data Visualization
      "recharts": "https://esm.sh/recharts@2.13.3",
      "chart.js": "https://esm.sh/chart.js@4.4.6",
      "react-chartjs-2": "https://esm.sh/react-chartjs-2@5.2.0",
      "d3": "https://esm.sh/d3@7.9.0",
      "victory": "https://esm.sh/victory@37.3.2",
      "nivo": "https://esm.sh/@nivo/core@0.87.0",
      "@nivo/bar": "https://esm.sh/@nivo/bar@0.87.0",
      "@nivo/line": "https://esm.sh/@nivo/line@0.87.0",
      "@nivo/pie": "https://esm.sh/@nivo/pie@0.87.0",

      // ✅ State Management
      "zustand": "https://esm.sh/zustand@5.0.2",
      "jotai": "https://esm.sh/jotai@2.10.3",
      "recoil": "https://esm.sh/recoil@0.7.7",
      "valtio": "https://esm.sh/valtio@2.1.2",
      "redux": "https://esm.sh/redux@5.0.1",
      "@reduxjs/toolkit": "https://esm.sh/@reduxjs/toolkit@2.5.0",
      "react-redux": "https://esm.sh/react-redux@9.2.0",
      "mobx": "https://esm.sh/mobx@6.13.5",
      "mobx-react-lite": "https://esm.sh/mobx-react-lite@4.1.0",

      // ✅ Forms & Validation
      "react-hook-form": "https://esm.sh/react-hook-form@7.54.0",
      "@hookform/resolvers": "https://esm.sh/@hookform/resolvers@3.9.1",
      "zod": "https://esm.sh/zod@3.24.0",
      "yup": "https://esm.sh/yup@1.6.1",
      "formik": "https://esm.sh/formik@2.4.6",

      // ✅ Data Fetching
      "@tanstack/react-query": "https://esm.sh/@tanstack/react-query@5.62.0",
      "react-query": "https://esm.sh/react-query@3.39.3",
      "swr": "https://esm.sh/swr@2.3.0",
      "axios": "https://esm.sh/axios@1.7.9",
      "ky": "https://esm.sh/ky@1.7.4",

      // ✅ Styling Utilities
      "clsx": "https://esm.sh/clsx@2.1.1",
      "classnames": "https://esm.sh/classnames@2.5.1",
      "tailwind-merge": "https://esm.sh/tailwind-merge@2.5.4",
      "cva": "https://esm.sh/class-variance-authority@0.7.1",
      "class-variance-authority": "https://esm.sh/class-variance-authority@0.7.1",
      "styled-components": "https://esm.sh/styled-components@6.1.13",
      "@emotion/react": "https://esm.sh/@emotion/react@11.14.0",
      "@emotion/styled": "https://esm.sh/@emotion/styled@11.14.0",

      // ✅ UI Component Libraries
      "@radix-ui/react-dialog": "https://esm.sh/@radix-ui/react-dialog@1.1.4",
      "@radix-ui/react-dropdown-menu": "https://esm.sh/@radix-ui/react-dropdown-menu@2.1.4",
      "@radix-ui/react-tooltip": "https://esm.sh/@radix-ui/react-tooltip@1.1.6",
      "@radix-ui/react-popover": "https://esm.sh/@radix-ui/react-popover@1.1.4",
      "@radix-ui/react-tabs": "https://esm.sh/@radix-ui/react-tabs@1.1.2",
      "@radix-ui/react-accordion": "https://esm.sh/@radix-ui/react-accordion@1.2.2",
      "@radix-ui/react-checkbox": "https://esm.sh/@radix-ui/react-checkbox@1.1.3",
      "@radix-ui/react-switch": "https://esm.sh/@radix-ui/react-switch@1.1.2",
      "@radix-ui/react-slider": "https://esm.sh/@radix-ui/react-slider@1.2.2",
      "@radix-ui/react-select": "https://esm.sh/@radix-ui/react-select@2.1.4",
      "@radix-ui/react-avatar": "https://esm.sh/@radix-ui/react-avatar@1.1.2",
      "@radix-ui/react-badge": "https://esm.sh/@radix-ui/react-badge@1.0.0",
      "@radix-ui/react-progress": "https://esm.sh/@radix-ui/react-progress@1.1.1",
      "@radix-ui/react-toast": "https://esm.sh/@radix-ui/react-toast@1.2.4",
      "@radix-ui/react-alert-dialog": "https://esm.sh/@radix-ui/react-alert-dialog@1.1.4",
      "@radix-ui/react-separator": "https://esm.sh/@radix-ui/react-separator@1.1.1",
      "@radix-ui/react-label": "https://esm.sh/@radix-ui/react-label@2.1.1",
      "@radix-ui/react-scroll-area": "https://esm.sh/@radix-ui/react-scroll-area@1.2.2",
      "@radix-ui/react-context-menu": "https://esm.sh/@radix-ui/react-context-menu@2.2.4",
      "@radix-ui/react-menubar": "https://esm.sh/@radix-ui/react-menubar@1.1.4",
      "@radix-ui/react-navigation-menu": "https://esm.sh/@radix-ui/react-navigation-menu@1.2.3",
      "@radix-ui/react-collapsible": "https://esm.sh/@radix-ui/react-collapsible@1.1.2",
      "@radix-ui/react-toggle": "https://esm.sh/@radix-ui/react-toggle@1.1.1",
      "@radix-ui/react-toggle-group": "https://esm.sh/@radix-ui/react-toggle-group@1.1.1",
      "@radix-ui/react-radio-group": "https://esm.sh/@radix-ui/react-radio-group@1.2.2",
      "@radix-ui/react-hover-card": "https://esm.sh/@radix-ui/react-hover-card@1.1.4",
      "@radix-ui/react-aspect-ratio": "https://esm.sh/@radix-ui/react-aspect-ratio@1.1.1",

      // ✅ Date & Time
      "date-fns": "https://esm.sh/date-fns@3.6.0",
      "dayjs": "https://esm.sh/dayjs@1.11.13",
      "moment": "https://esm.sh/moment@2.30.1",
      "luxon": "https://esm.sh/luxon@3.5.0",
      "react-datepicker": "https://esm.sh/react-datepicker@7.5.0",

      // ✅ Utility Libraries
      "lodash": "https://esm.sh/lodash@4.17.21",
      "lodash-es": "https://esm.sh/lodash-es@4.17.21",
      "ramda": "https://esm.sh/ramda@0.30.1",
      "uuid": "https://esm.sh/uuid@11.0.3",
      "nanoid": "https://esm.sh/nanoid@5.0.9",
      "immer": "https://esm.sh/immer@10.1.1",

      // ✅ Table
      "@tanstack/react-table": "https://esm.sh/@tanstack/react-table@8.20.5",
      "react-table": "https://esm.sh/react-table@7.8.0",

      // ✅ Drag & Drop
      "@dnd-kit/core": "https://esm.sh/@dnd-kit/core@6.3.1",
      "@dnd-kit/sortable": "https://esm.sh/@dnd-kit/sortable@8.0.0",
      "@dnd-kit/utilities": "https://esm.sh/@dnd-kit/utilities@3.2.2",
      "react-beautiful-dnd": "https://esm.sh/react-beautiful-dnd@13.1.1",
      "react-dnd": "https://esm.sh/react-dnd@16.0.1",

      // ✅ Notifications / Toast
      "react-hot-toast": "https://esm.sh/react-hot-toast@2.4.1",
      "sonner": "https://esm.sh/sonner@1.7.2",
      "react-toastify": "https://esm.sh/react-toastify@10.0.6",

      // ✅ Maps
      "leaflet": "https://esm.sh/leaflet@1.9.4",
      "react-leaflet": "https://esm.sh/react-leaflet@4.2.1",
      "mapbox-gl": "https://esm.sh/mapbox-gl@3.9.2",

      // ✅ Rich Text / Editor
      "@tiptap/react": "https://esm.sh/@tiptap/react@2.10.4",
      "@tiptap/starter-kit": "https://esm.sh/@tiptap/starter-kit@2.10.4",
      "react-quill": "https://esm.sh/react-quill@2.0.0",
      "slate": "https://esm.sh/slate@0.110.2",
      "slate-react": "https://esm.sh/slate-react@0.110.1",

      // ✅ Markdown
      "react-markdown": "https://esm.sh/react-markdown@9.0.1",
      "marked": "https://esm.sh/marked@15.0.6",
      "remark-gfm": "https://esm.sh/remark-gfm@4.0.0",
      "highlight.js": "https://esm.sh/highlight.js@11.10.0",
      "prismjs": "https://esm.sh/prismjs@1.29.0",

      // ✅ File Upload
      "react-dropzone": "https://esm.sh/react-dropzone@14.3.5",

      // ✅ Virtual List
      "react-window": "https://esm.sh/react-window@1.8.10",
      "react-virtualized": "https://esm.sh/react-virtualized@9.22.5",
      "@tanstack/react-virtual": "https://esm.sh/@tanstack/react-virtual@3.11.2",

      // ✅ Audio
      "wavesurfer.js": "https://esm.sh/wavesurfer.js@7.8.15",
      "wavesurfer.js/": "https://esm.sh/wavesurfer.js@7.8.15/",
      "wavesurfer.js/dist/plugins/": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/",

      // Common Wavesurfer plugins (explicit aliases)
      "wavesurfer.js/dist/plugins/regions": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/regions.esm.js",
      "wavesurfer.js/dist/plugins/regions.js": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/regions.esm.js",
      "wavesurfer.js/dist/plugins/regions.esm.js": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/regions.esm.js",
      "wavesurfer.js/dist/plugins/timeline": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/timeline.esm.js",
      "wavesurfer.js/dist/plugins/timeline.js": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/timeline.esm.js",
      "wavesurfer.js/dist/plugins/timeline.esm.js": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/timeline.esm.js",
      "wavesurfer.js/dist/plugins/minimap": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/minimap.esm.js",
      "wavesurfer.js/dist/plugins/minimap.js": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/minimap.esm.js",
      "wavesurfer.js/dist/plugins/minimap.esm.js": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/minimap.esm.js",
      "wavesurfer.js/dist/plugins/spectrogram": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/spectrogram.esm.js",
      "wavesurfer.js/dist/plugins/spectrogram.js": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/spectrogram.esm.js",
      "wavesurfer.js/dist/plugins/spectrogram.esm.js": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/spectrogram.esm.js",
      "wavesurfer.js/dist/plugins/envelope": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/envelope.esm.js",
      "wavesurfer.js/dist/plugins/envelope.js": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/envelope.esm.js",
      "wavesurfer.js/dist/plugins/envelope.esm.js": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/envelope.esm.js",
      "wavesurfer.js/dist/plugins/hover": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/hover.esm.js",
      "wavesurfer.js/dist/plugins/hover.js": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/hover.esm.js",
      "wavesurfer.js/dist/plugins/hover.esm.js": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/hover.esm.js",
      "wavesurfer.js/dist/plugins/record": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/record.esm.js",
      "wavesurfer.js/dist/plugins/record.js": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/record.esm.js",
      "wavesurfer.js/dist/plugins/record.esm.js": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/record.esm.js",
      "wavesurfer.js/dist/plugins/zoom": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/zoom.esm.js",
      "wavesurfer.js/dist/plugins/zoom.js": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/zoom.esm.js",
      "wavesurfer.js/dist/plugins/zoom.esm.js": "https://esm.sh/wavesurfer.js@7.8.15/dist/plugins/zoom.esm.js",

      // ✅ 3D & Canvas
      "three": "https://esm.sh/three@0.170.0",
      "@react-three/fiber": "https://esm.sh/@react-three/fiber@8.17.10",
      "@react-three/drei": "https://esm.sh/@react-three/drei@9.120.4",
      "konva": "https://esm.sh/konva@9.3.16",
      "react-konva": "https://esm.sh/react-konva@18.2.10",

      // ✅ Carousel / Slider
      "swiper": "https://esm.sh/swiper@11.1.15",
      "react-slick": "https://esm.sh/react-slick@0.30.3",
      "embla-carousel-react": "https://esm.sh/embla-carousel-react@8.5.1",

      // ✅ QR Code
      "qrcode.react": "https://esm.sh/qrcode.react@4.2.0",
      "react-qr-code": "https://esm.sh/react-qr-code@2.0.15",

      // ✅ PDF
      "react-pdf": "https://cdn.jsdelivr.net/npm/react-pdf@7.7.3/+esm",
      "@react-pdf/renderer": "https://cdn.jsdelivr.net/npm/@react-pdf/renderer@3.4.4/+esm",
      "pdfjs-dist": "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/+esm",

      // ✅ Internationalization
      "i18next": "https://esm.sh/i18next@24.2.2",
      "react-i18next": "https://esm.sh/react-i18next@15.4.0",

      // ✅ Auth
      "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.47.10",
      "firebase": "https://esm.sh/firebase@11.2.0",

      // ✅ Math & Science
      "mathjs": "https://esm.sh/mathjs@13.2.3",
      "ml-matrix": "https://esm.sh/ml-matrix@6.11.0",

      // ✅ Misc
      "confetti": "https://esm.sh/canvas-confetti@1.9.3",
      "canvas-confetti": "https://esm.sh/canvas-confetti@1.9.3",
      "react-confetti": "https://esm.sh/react-confetti@6.1.0",
      "react-use": "https://esm.sh/react-use@17.6.0",
      "ahooks": "https://esm.sh/ahooks@3.8.4",
      "usehooks-ts": "https://esm.sh/usehooks-ts@3.1.0",
      "react-error-boundary": "https://esm.sh/react-error-boundary@5.0.0",
      "react-helmet": "https://esm.sh/react-helmet@6.1.0",
      "react-helmet-async": "https://esm.sh/react-helmet-async@2.0.5",
      "react-intersection-observer": "https://esm.sh/react-intersection-observer@9.14.0",
      "react-countdown": "https://esm.sh/react-countdown@2.3.6",
      "react-copy-to-clipboard": "https://esm.sh/react-copy-to-clipboard@5.1.0",
      "copy-to-clipboard": "https://esm.sh/copy-to-clipboard@3.3.3",
      "react-color": "https://esm.sh/react-color@2.19.3",
      "@uiw/react-color": "https://esm.sh/@uiw/react-color@2.3.2",
      "react-syntax-highlighter": "https://esm.sh/react-syntax-highlighter@15.6.1",
      "react-resizable": "https://esm.sh/react-resizable@3.0.5",
      "react-split": "https://esm.sh/react-split@2.0.14",
      "split.js": "https://esm.sh/split.js@1.6.5",
      "react-flow-renderer": "https://esm.sh/react-flow-renderer@10.3.17",
      "@xyflow/react": "https://esm.sh/@xyflow/react@12.4.0",
      "reactflow": "https://esm.sh/reactflow@11.11.4",
      "zustand/middleware": "https://esm.sh/zustand@5.0.2/middleware",
    };

    // Add local files to import map as Object URLs or Data URIs
    Object.entries(transpiledFiles).forEach(([path, code]) => {
      try {
        let url: string;
        if (useDataUri) {
          url = `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`;
        } else {
          const blob = new Blob([code], { type: 'text/javascript' });
          url = URL.createObjectURL(blob);
        }
        
        const cleanPath = path.replace(/\.(ts|tsx|js|jsx)$/, '');
        const aliasSet = new Set<string>();
        const previewBase = 'https://preview.local/';
        const addAlias = (...candidates: Array<string | undefined>) => {
          for (const candidate of candidates) {
            if (!candidate) continue;
            const normalized = candidate.trim();
            if (!normalized) continue;

            aliasSet.add(normalized);
            aliasSet.add(normalized.toLowerCase());

            // URL-like specifiers may be canonicalized before import-map matching.
            // Also add fully-qualified preview URLs to cover `/foo` imports from blob modules.
            if (normalized.startsWith('/')) {
              const full = new URL(normalized, previewBase).href;
              aliasSet.add(full);
              aliasSet.add(full.toLowerCase());
            }
            if (normalized.startsWith('./')) {
              const full = new URL(normalized.slice(2), previewBase).href;
              aliasSet.add(full);
              aliasSet.add(full.toLowerCase());
            }
          }
        };

        addAlias(cleanPath, path, `./${cleanPath}`, `./${path}`, `/${cleanPath}`, `/${path}`, `@/${cleanPath}`, `@/${path}`);

        if (path.startsWith('app/')) {
          const appRelativeWithExt = path.replace('app/', './');
          const appRelative = appRelativeWithExt.replace(/\.(ts|tsx|js|jsx)$/, '');
          addAlias(appRelativeWithExt, appRelative, appRelative.replace(/^\.\//, '/'), appRelative.replace(/^\.\//, '@/'));
        }

        if (path.startsWith('admin/')) {
          const adminRelativeWithExt = path.replace('admin/', './');
          const adminRelative = adminRelativeWithExt.replace(/\.(ts|tsx|js|jsx)$/, '');
          addAlias(adminRelativeWithExt, adminRelative, adminRelative.replace(/^\.\//, '/'), adminRelative.replace(/^\.\//, '@/'));
        }

        // Also map common source-root prefixes to "./..." and "/..." imports.
        // Example: src/components/Button.tsx should resolve both
        // "./src/components/Button" and "./components/Button".
        const aliasPrefixes: string[] = ['src/', 'app/src/', 'admin/src/', 'frontend/', 'client/', 'web/'];
        for (const prefix of aliasPrefixes) {
          if (!cleanPath.startsWith(prefix)) continue;
          const withoutPrefix = cleanPath.slice(prefix.length);
          const withoutPrefixWithExt = path.startsWith(prefix) ? path.slice(prefix.length) : '';
          if (!withoutPrefix) continue;
          addAlias(`./${withoutPrefix}`, `/${withoutPrefix}`, `@/${withoutPrefix}`);
          if (withoutPrefixWithExt) {
            addAlias(`./${withoutPrefixWithExt}`, `/${withoutPrefixWithExt}`, `@/${withoutPrefixWithExt}`);
          }
        }

        // If module is an index file, map its parent directory import too.
        // Example: app/components/Calculator/index.tsx -> /components/Calculator
        if (cleanPath.endsWith('/index')) {
          const parent = cleanPath.slice(0, -('/index'.length));
          addAlias(parent, `./${parent}`, `/${parent}`);
          if (parent.startsWith('app/')) {
            const appParent = parent.replace(/^app\//, '');
            addAlias(`./${appParent}`, `/${appParent}`);
          }
          if (parent.startsWith('admin/')) {
            const adminParent = parent.replace(/^admin\//, '');
            addAlias(`./${adminParent}`, `/${adminParent}`);
          }
        }

        aliasSet.forEach((alias) => {
          importMap[alias] = url;
        });
      } catch (e) {
        console.error(`Failed to create Object URL for ${path}:`, e);
      }
    });

    const importMapScript = `<script type="importmap">${JSON.stringify({ imports: importMap })}</script>`;

    // Entry Point Search
    const htmlFiles = Object.entries(projectFiles)
      .filter(([path, content]) => path.endsWith('.html') && content.length > 0)
      .sort(([a], [b]) => {
        if (a.includes('index.html')) return -1;
        if (b.includes('index.html')) return 1;
        return 0;
      });

    let entryHtml = projectFiles[entryPath] || (htmlFiles.length > 0 ? htmlFiles[0][1] : '<div id="root"></div>');

    // React Auto-Bootstrap
    const hasReact = Object.keys(projectFiles).some(f => f.endsWith('.tsx') || f.endsWith('.jsx'));
    let bootstrapScript = '';

    if (hasReact) {
      const workspacePrefix = isAppWorkspace ? 'app/' : 'admin/';
      const files = Object.keys(transpiledFiles);
      const entryFile = files.find(f => 
        f === `${workspacePrefix}main` || f === `${workspacePrefix}index` || f === `${workspacePrefix}App` ||
        f === 'main' || f === 'index' || f === 'App'
      ) || 
      files.find(f => f.startsWith(workspacePrefix) && (f.includes('components/') || f.includes('pages/'))) ||
      files.find(f => f.startsWith(workspacePrefix) && f.split('/').pop()![0] === f.split('/').pop()![0].toUpperCase()) ||
      files.find(f => f.startsWith(workspacePrefix));

      if (entryFile) {
        const importSpecifier = entryFile.replace(/\.(ts|tsx|js|jsx)$/, '');
        const entrySourcePath = [
          `${entryFile}.tsx`,
          `${entryFile}.ts`,
          `${entryFile}.jsx`,
          `${entryFile}.js`,
          entryFile
        ].find(candidate => Boolean(projectFiles[candidate]));
        const entrySourceCode = entrySourcePath ? (projectFiles[entrySourcePath] || '') : '';
        const entrySelfBootstraps = /createRoot\s*\(/.test(entrySourceCode) || /hydrateRoot\s*\(/.test(entrySourceCode) || /ReactDOM\.render\s*\(/.test(entrySourceCode);

        bootstrapScript = entrySelfBootstraps
          ? `
            <script type="module">
              import "${importSpecifier}";
            </script>
          `
          : `
            <script type="module">
              import React from 'react';
              import { createRoot } from 'react-dom/client';
              import * as Main from "${importSpecifier}";
              const init = () => {
                const rootElement = document.getElementById('root') || document.getElementById('app') || document.body;
                if (rootElement && rootElement.innerHTML.trim().length < 10) {
                  const App = Main.default || Object.values(Main).find(v => typeof v === 'function' && v.name && v.name[0] === v.name[0].toUpperCase());
                  if (App) {
                    try {
                      const root = createRoot(rootElement);
                      root.render(React.createElement(App));
                    } catch (e) { console.error('Bootstrap Error:', e); }
                  }
                }
              };
              if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', init);
              else init();
            </script>
          `;
      }
    }

    const baseHref = useDataUri ? '' : '<base href="https://preview.local/">';

    const headInjection = `
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
      ${baseHref}
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html, body { height: 100%; margin: 0; padding: 0; background-color: #09090b !important; color: #f4f4f5; font-family: sans-serif; }
        ::-webkit-scrollbar { display: none; }
        ${cssFiles.join('\n')}
      </style>
      ${importMapScript}
      ${polyfill}
    `;

    let processedHtml = entryHtml
      .replace(/<link[^>]+href=["'](?!\w+:\/\/)[^"']+["'][^>]*>/gi, '')
      .replace(/<script[^>]+src=["'](?!\w+:\/\/)[^"']+["'][^>]*><\/script>/gi, '');

    // React previews are bootstrapped by this builder from transpiled object-URL modules.
    // Inline module scripts inside srcdoc often import relative paths (./components/...),
    // which resolve against about:srcdoc and can fail with non-hierarchical URL errors.
    // Removing them avoids duplicate runtime entrypoints and prevents the srcdoc resolver crash.
    if (hasReact) {
      processedHtml = processedHtml.replace(/<script[^>]*type=["']module["'][^>]*>[\s\S]*?<\/script>/gi, '');
    }

    if (!processedHtml.toLowerCase().includes('<html')) {
      return `<!DOCTYPE html><html lang="en"><head>${headInjection}</head><body>${processedHtml}${bootstrapScript}</body></html>`;
    }

    const hasHead = /<head[^>]*>/i.test(processedHtml);
    if (hasHead) {
      processedHtml = processedHtml.replace(/<head([^>]*)>/i, `<head$1>${headInjection}`);
    } else if (processedHtml.includes('</head>')) {
      processedHtml = processedHtml.replace('</head>', `${headInjection}</head>`);
    } else {
      processedHtml = processedHtml.replace('<body', `<head>${headInjection}</head><body`);
    }

    if (processedHtml.includes('</body>')) {
      processedHtml = processedHtml.replace('</body>', `${bootstrapScript}</body>`);
    } else {
      processedHtml = processedHtml + bootstrapScript;
    }

    return processedHtml;
  } catch (error) {
    console.error('PREVIEW_BUILD_ERROR:', error);
    return `<div style="color:red;padding:20px;">Build Error: ${error instanceof Error ? error.message : 'Unknown'}</div>`;
  }
};
