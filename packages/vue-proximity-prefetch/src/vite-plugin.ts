/**
 * Vue Proximity Prefetch - Vite Plugin
 * 
 * This plugin enhances Vue Router applications by adding proximity-based prefetching
 * capabilities, improving user experience through faster route transitions.
 */

import type { Plugin } from 'vite';

/**
 * Configuration options for the Vue Proximity Prefetch plugin
 */
export interface VueProximityPrefetchOptions {
  /**
   * Distance threshold in pixels that triggers prefetching when the cursor
   * approaches a link element
   * @default 200
   */
  threshold?: number;
  
  /**
   * Interval for periodic prediction checks (in milliseconds)
   * When set to 0, checks are triggered by mouse movements
   * @default 0
   */
  predictionInterval?: number;
  
  /**
   * Maximum number of routes to prefetch simultaneously
   * Limits resource usage while still enhancing perceived performance
   * @default 3
   */
  maxPrefetch?: number;
  
  /**
   * Enable debug logging in the console
   * Useful for development and troubleshooting
   * @default false
   */
  debug?: boolean;

  /**
   * Enable automatic prefetching without needing to add the Vue component
   * When true, a global script is injected that handles prefetching for all routes
   * @default false
   */
  automaticPrefetch?: boolean;
  
  /**
   * Enable mobile support for touch devices
   * When true, touch events and viewport-based prefetching are enabled
   * @default true
   */
  mobileSupport?: boolean;
  
  /**
   * Viewport margin (in pixels) for prefetching on mobile
   * Links that are within this distance from the viewport will be prefetched
   * @default 300
   */
  viewportMargin?: number;
  
  /**
   * Enable prefetching of all links on the page at once
   * When true, all internal links will be prefetched after page load
   * @default false
   */
  prefetchAllLinks?: boolean;
  
  /**
   * Delay (in milliseconds) before starting to prefetch all links
   * Only used when prefetchAllLinks is true
   * @default 1500
   */
  prefetchAllLinksDelay?: number;
}

/**
 * Default configuration values
 */
const DEFAULT_OPTIONS: Required<VueProximityPrefetchOptions> = {
  threshold: 200,
  predictionInterval: 0,
  maxPrefetch: 3,
  debug: false,
  automaticPrefetch: false,
  mobileSupport: true,
  viewportMargin: 300,
  prefetchAllLinks: false,
  prefetchAllLinksDelay: 1500
};

/**
 * Generate the prefetch script to be injected in the page
 */
function generatePrefetchScript(options: Required<VueProximityPrefetchOptions>): string {
  return `
  <!-- Injected by Vue Proximity Prefetch Plugin -->
  <script>
    (function() {
      // Set global PPF_DEBUG flag for the Vue component to detect
      window.PPF_DEBUG = ${options.debug};
      
      // Configuration from Vite plugin
      const config = {
        threshold: ${options.threshold},
        predictionInterval: ${options.predictionInterval},
        maxPrefetch: ${options.maxPrefetch},
        debug: ${options.debug} || (typeof window !== 'undefined' && window.PPF_DEBUG === true),
        mobileSupport: ${options.mobileSupport},
        viewportMargin: ${options.viewportMargin},
        prefetchAllLinks: ${options.prefetchAllLinks},
        prefetchAllLinksDelay: ${options.prefetchAllLinksDelay}
      };
      
      // Utils
      const log = config.debug ? console.log.bind(console, '[ProximityPrefetch]') : () => {};
      log('Automatic prefetching enabled with options:', config);
      
      // State variables
      let mousePosition = { x: 0, y: 0 };
      let prefetchedRoutes = new Set();
      let lastCheck = Date.now();
      const THROTTLE_INTERVAL = 100;
      
      // Device detection
      let isTouchDevice = false;
      
      // Detect touch devices
      function detectTouchDevice() {
        return (('ontouchstart' in window) || 
                (navigator.maxTouchPoints > 0) || 
                (navigator.msMaxTouchPoints > 0));
      }
      
      // Calculate Euclidean distance between two points
      function calculateDistance(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) ** 2 + (y1 - y2) ** 2);
      }
      
      // Calculate center point of a DOMRect
      function calculateCenterPoint(rect) {
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      }
      
      // Get all valid links on the page
      function getLinks() {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        return anchors
          .map((el) => {
            const href = el.getAttribute('href');
            // Only include internal links (starting with / or without ://) and not anchor links
            if (href && (href.startsWith('/') || !href.includes('://')) && !href.startsWith('#')) {
              const rect = el.getBoundingClientRect();
              return { el, href, rect };
            }
            return null;
          })
          .filter(link => link !== null);
      }
      
      // Prefetch a single route
      function prefetchRoute(route) {
        if (prefetchedRoutes.has(route)) return;
        
        try {
          // Create a prefetch link element
          const link = document.createElement('link');
          link.rel = 'prefetch';
          link.href = route;
          link.as = 'document';
          document.head.appendChild(link);
          
          prefetchedRoutes.add(route);
          
          // In debug mode, add a visual indicator around the link
          if (config.debug) {
            // Find all link elements pointing to this route
            const matchingAnchors = Array.from(document.querySelectorAll('a[href="' + route + '"]'));
            
            matchingAnchors.forEach(anchor => {
              // Add a red border directly to the link element if not already applied
              if (!anchor.hasAttribute('data-ppf-debug-applied')) {
                anchor.setAttribute('data-ppf-debug-applied', 'true');
                anchor.classList.add('ppf-debug-highlight');
                anchor.title = 'Prefetched: ' + route;
              }
            });
          }
          
          return true;
        } catch (err) {
          console.error('[ProximityPrefetch] Error prefetching route:', route, err);
          return false;
        }
      }
      
      // Prefetch all links on the page
      function prefetchAllPageLinks() {
        const links = getLinks();
        if (!links.length) return;
        
        log('Prefetching all links on page: ' + links.length + ' links found');
        
        // Get unique routes
        const uniqueRoutes = [...new Set(links.map(link => link.href))];
        
        // Batch prefetching with small delays to avoid network congestion
        let processed = 0;
        const batchSize = 3;
        const batchDelay = 300;
        
        function processBatch() {
          const batch = uniqueRoutes.slice(processed, processed + batchSize);
          if (batch.length === 0) return;
          
          for (const route of batch) {
            prefetchRoute(route);
          }
          
          processed += batch.length;
          
          if (processed < uniqueRoutes.length) {
            setTimeout(processBatch, batchDelay);
          } else if (config.debug) {
            log('Finished prefetching all links: ' + processed + ' routes prefetched');
          }
        }
        
        processBatch();
      }
      
      // Check if a link is in or near the viewport
      function isLinkInViewport(rect) {
        // Check if fully in viewport
        const isVisible = (
          rect.top >= -config.viewportMargin &&
          rect.left >= -config.viewportMargin &&
          rect.bottom <= window.innerHeight + config.viewportMargin &&
          rect.right <= window.innerWidth + config.viewportMargin
        );
        
        return isVisible;
      }
      
      // Check if mouse is near any links (for desktop)
      function checkProximity() {
        const links = getLinks();
        if (!links.length) return false;
        
        // Calculate distance between mouse and each link
        const linksWithDistance = links.map((link) => {
          const center = calculateCenterPoint(link.rect);
          const distance = calculateDistance(
            mousePosition.x,
            mousePosition.y,
            center.x,
            center.y
          );
          return { ...link, distance };
        });
        
        // Find links within threshold distance
        const closestLinks = linksWithDistance.filter(
          (link) => link.distance < config.threshold
        );
        
        if (config.debug && closestLinks.length > 0) {
          log(closestLinks.length + ' links within threshold ' + config.threshold + 'px');
        }
        
        return closestLinks;
      }
      
      // Check which links are in or near viewport (for mobile)
      function checkViewportLinks() {
        const links = getLinks();
        if (!links.length) return false;
        
        // Filter links that are in or near the viewport
        const visibleLinks = links.filter(link => isLinkInViewport(link.rect));
        
        if (config.debug && visibleLinks.length > 0) {
          log(visibleLinks.length + ' links in viewport (plus margin ' + config.viewportMargin + 'px)');
        }
        
        return visibleLinks;
      }
      
      // Prefetch routes when mouse is near links or links are in viewport
      function prefetchNearbyRoutes() {
        const now = Date.now();
        if (now - lastCheck < THROTTLE_INTERVAL) return;
        lastCheck = now;
        
        // Choose detection strategy based on device type
        const links = isTouchDevice ? checkViewportLinks() : checkProximity();
        if (!links || !links.length) return;
        
        // Sort links: by distance for desktop, by position for mobile
        if (isTouchDevice) {
          // On mobile, prioritize links near the top of viewport
          links.sort((a, b) => a.rect.top - b.rect.top);
        } else {
          // On desktop, keep sorting by distance
          links.sort((a, b) => a.distance - b.distance);
        }
        
        // Limit prefetching to maxPrefetch routes
        const routesToPrefetch = links.slice(0, config.maxPrefetch).map(link => link.href);
        
        // Keep track of the first link being processed
        let isFirstPrefetch = !window.PPF_HAS_PREFETCHED;
        
        // Prefetch routes
        for (const route of routesToPrefetch) {
          prefetchRoute(route);
        }
      }
      
      // Initialize
      function init() {
        // Detect device type
        isTouchDevice = detectTouchDevice();
        log('Device detection: ' + (isTouchDevice ? 'Touch device' : 'Desktop device'));
        
        // Add debug styles to the page if in debug mode
        if (config.debug) {
          const style = document.createElement('style');
          style.textContent = 
            '.ppf-debug-highlight {' +
            '  box-shadow: 0 0 0 2px red !important;' +
            '  box-sizing: border-box;' +
            '}';
          document.head.appendChild(style);
        }
        
        // If prefetchAllLinks is enabled, prefetch all links after a delay
        if (config.prefetchAllLinks) {
          log('prefetchAllLinks enabled, will prefetch all links after ' + config.prefetchAllLinksDelay + 'ms');
          setTimeout(prefetchAllPageLinks, config.prefetchAllLinksDelay);
        }
        
        if (isTouchDevice && config.mobileSupport) {
          // Mobile approach: viewport-based prefetching
          
          // 1. Check on page load
          prefetchNearbyRoutes();
          
          // 2. Check on scroll with throttling
          window.addEventListener('scroll', () => {
            const now = Date.now();
            if (now - lastCheck > THROTTLE_INTERVAL) {
              prefetchNearbyRoutes();
            }
          }, { passive: true });
          
          // 3. Check on touch events
          window.addEventListener('touchstart', () => {
            prefetchNearbyRoutes();
          }, { passive: true });
          
          // 4. Check periodically if interval is set
          if (config.predictionInterval > 0) {
            setInterval(prefetchNearbyRoutes, config.predictionInterval);
          }
          
          log('Mobile prefetching initialized with viewport margin:', config.viewportMargin + 'px');
        } else {
          // Desktop approach: mouse proximity
          
          // Mouse move listener
          window.addEventListener('mousemove', (e) => {
            mousePosition = { x: e.clientX, y: e.clientY };
            
            // Reactive mode
            if (config.predictionInterval === 0) {
              prefetchNearbyRoutes();
            }
          });
          
          // Interval mode
          if (config.predictionInterval > 0) {
            setInterval(() => {
              if (mousePosition.x !== 0 || mousePosition.y !== 0) {
                prefetchNearbyRoutes();
              }
            }, config.predictionInterval);
          }
          
          log('Desktop proximity prefetching initialized');
        }
        
        // Window resize handler to update link positions
        window.addEventListener('resize', () => {
          // Throttle resize event
          const now = Date.now();
          if (now - lastCheck > THROTTLE_INTERVAL * 2) {
            lastCheck = now;
            prefetchNearbyRoutes();
          }
        }, { passive: true });
      }
      
      // Start when DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    })();
  </script>
  `;
}

/**
 * Creates a Vite plugin that enhances Vue Router with proximity-based prefetching
 * 
 * @param options - Configuration options for the prefetching behavior
 * @returns Vite plugin instance
 */
export function viteProximityPrefetch(options: VueProximityPrefetchOptions = {}): Plugin {
  // Check if PPF_DEBUG environment variable is set
  const PPF_DEBUG = process.env.PPF_DEBUG === 'true';
  
  // Merge provided options with defaults, respecting PPF_DEBUG
  const resolvedOptions: Required<VueProximityPrefetchOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
    debug: options.debug || PPF_DEBUG
  };

  return {
    name: 'vite-plugin-vue-proximity-prefetch',
    
    configResolved() {
      console.log('Vue Proximity Prefetch Plugin enabled');
      
      if (resolvedOptions.debug) {
        console.log('Options:', {
          threshold: resolvedOptions.threshold,
          predictionInterval: resolvedOptions.predictionInterval,
          maxPrefetch: resolvedOptions.maxPrefetch,
          automaticPrefetch: resolvedOptions.automaticPrefetch,
          debug: resolvedOptions.debug,
          mobileSupport: resolvedOptions.mobileSupport,
          viewportMargin: resolvedOptions.viewportMargin
        });
      }
    },
    
    /**
     * Transform HTML to add prefetch attributes to preloaded modules
     * and inject the automatic prefetching script if enabled
     */
    transformIndexHtml(html) {
      // Add prefetch attribute to module preload links
      const transformedHtml = html.replace(
        /<link rel="modulepreload"/g,
        '<link rel="modulepreload" data-prefetch="true"'
      );
      
      // If automatic prefetching is enabled, inject the script
      if (resolvedOptions.automaticPrefetch) {
        const injectionPoint = '</head>';
        const prefetchScript = generatePrefetchScript(resolvedOptions);
        
        return transformedHtml.replace(
          injectionPoint,
          `${prefetchScript}\n${injectionPoint}`
        );
      }
      
      return transformedHtml;
    }
  };
}

export default viteProximityPrefetch;