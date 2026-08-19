/**
 * Provider-Agnostic, Capability-Driven Document Viewer Service
 * 
 * Provides unified rendering strategy resolution, automatic fallbacks,
 * and capability caching across mobile, tablet, and desktop environments.
 */

import { fetchDriveFileAsObjectUrl } from './googleDrive.js';

const STRATEGY_CACHE_KEY_PREFIX = 'sitetactix_viewer_strategy_pref_';

export const FILE_CATEGORIES = {
  PDF: 'pdf',
  IMAGE: 'image',
  TEXT: 'text',
  SPREADSHEET: 'spreadsheet',
  GENERIC: 'generic'
};

export const RENDER_MODES = {
  IFRAME_EMBED: 'iframe_embed',
  IMAGE_DIRECT: 'image_direct',
  BLOB_EMBED: 'blob_embed',
  DOWNLOAD_FALLBACK: 'download_fallback',
  EXTERNAL_LINK: 'external_link'
};

/**
 * Detect client browser & device capabilities
 */
export function detectBrowserCapabilities() {
  if (typeof window === 'undefined') {
    return {
      isMobile: false,
      isAndroid: false,
      isIOS: false,
      pdfViewerEnabled: false,
      supportsTouch: false
    };
  }

  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMobile = isAndroid || isIOS || /Mobile|Silk|Kindle/i.test(ua);
  const pdfViewerEnabled = Boolean(navigator.pdfViewerEnabled);
  const supportsTouch = 'ontouchstart' in window || (navigator.maxTouchPoints > 0);

  return {
    isMobile,
    isAndroid,
    isIOS,
    pdfViewerEnabled,
    supportsTouch
  };
}

/**
 * Infer file category from name or MIME type
 */
export function inferFileCategory(fileName = '', mimeType = '') {
  const cleanName = String(fileName).toLowerCase();
  const cleanMime = String(mimeType).toLowerCase();

  if (cleanName.endsWith('.pdf') || cleanMime.includes('pdf')) {
    return FILE_CATEGORIES.PDF;
  }
  if (
    cleanName.match(/\.(jpe?g|png|webp|gif|svg|bmp|heic)$/) ||
    cleanMime.startsWith('image/')
  ) {
    return FILE_CATEGORIES.IMAGE;
  }
  if (
    cleanName.match(/\.(txt|csv|md|json|log)$/) ||
    cleanMime.startsWith('text/')
  ) {
    return FILE_CATEGORIES.TEXT;
  }
  if (
    cleanName.match(/\.(xlsx?|ods|numbers)$/) ||
    cleanMime.includes('spreadsheet') ||
    cleanMime.includes('excel')
  ) {
    return FILE_CATEGORIES.SPREADSHEET;
  }

  return FILE_CATEGORIES.GENERIC;
}

/**
 * Strategy: Google Drive Official Preview Embed
 */
export const GoogleDrivePreviewStrategy = {
  id: 'drive_preview_embed',
  name: 'Google Drive Embedded Preview',
  renderMode: RENDER_MODES.IFRAME_EMBED,
  isSupported(capabilities, fileMeta) {
    return Boolean(fileMeta.fileId && (fileMeta.provider === 'google_drive' || !fileMeta.provider));
  },
  resolveUrl(fileMeta) {
    return `https://drive.google.com/file/d/${encodeURIComponent(fileMeta.fileId)}/preview`;
  }
};

/**
 * Strategy: Direct Image Render
 */
export const DirectImageStrategy = {
  id: 'image_direct',
  name: 'Direct Image Viewer',
  renderMode: RENDER_MODES.IMAGE_DIRECT,
  isSupported(capabilities, fileMeta) {
    const cat = inferFileCategory(fileMeta.fileName, fileMeta.mimeType);
    return cat === FILE_CATEGORIES.IMAGE;
  },
  async resolveUrl(fileMeta, token) {
    if (fileMeta.directUrl) return fileMeta.directUrl;
    if (token && fileMeta.fileId) {
      return await fetchDriveFileAsObjectUrl(token, fileMeta.fileId);
    }
    return '';
  }
};

/**
 * Strategy: In-Memory Blob Embed (Desktop Only for PDFs)
 */
export const BlobEmbedStrategy = {
  id: 'blob_embed',
  name: 'In-Memory Blob Embed',
  renderMode: RENDER_MODES.BLOB_EMBED,
  isSupported(capabilities, fileMeta) {
    const cat = inferFileCategory(fileMeta.fileName, fileMeta.mimeType);
    // Blobs in iframes fail on mobile Android Chrome - only allow if pdfViewerEnabled or Desktop
    return !capabilities.isMobile && capabilities.pdfViewerEnabled && cat === FILE_CATEGORIES.PDF;
  },
  async resolveUrl(fileMeta, token) {
    if (token && fileMeta.fileId) {
      return await fetchDriveFileAsObjectUrl(token, fileMeta.fileId);
    }
    return '';
  }
};

/**
 * Strategy: External Provider App View
 */
export const ExternalProviderStrategy = {
  id: 'external_provider',
  name: 'External Storage App View',
  renderMode: RENDER_MODES.EXTERNAL_LINK,
  isSupported() {
    return true; // Universal fallback
  },
  resolveUrl(fileMeta) {
    if (fileMeta.externalUrl) return fileMeta.externalUrl;
    if (fileMeta.fileId) {
      return `https://drive.google.com/file/d/${encodeURIComponent(fileMeta.fileId)}/view`;
    }
    return '';
  }
};

/**
 * Strategy: Download File Fallback
 */
export const DownloadFallbackStrategy = {
  id: 'download_fallback',
  name: 'Download Document',
  renderMode: RENDER_MODES.DOWNLOAD_FALLBACK,
  isSupported() {
    return true;
  },
  resolveUrl(fileMeta) {
    if (fileMeta.downloadUrl) return fileMeta.downloadUrl;
    if (fileMeta.fileId) {
      return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileMeta.fileId)}`;
    }
    return '';
  }
};

export const ALL_STRATEGIES = [
  DirectImageStrategy,
  GoogleDrivePreviewStrategy,
  BlobEmbedStrategy,
  ExternalProviderStrategy,
  DownloadFallbackStrategy
];

/**
 * Resolves the ordered fallback strategy chain for a file on the current device
 */
export function getStrategyChainForFile(fileMeta, capabilities = detectBrowserCapabilities()) {
  const category = inferFileCategory(fileMeta?.fileName, fileMeta?.mimeType);
  const isImage = category === FILE_CATEGORIES.IMAGE;
  const isPdf = category === FILE_CATEGORIES.PDF;

  const chain = [];

  if (isImage) {
    chain.push(DirectImageStrategy);
    chain.push(GoogleDrivePreviewStrategy);
    chain.push(ExternalProviderStrategy);
    chain.push(DownloadFallbackStrategy);
  } else if (isPdf) {
    if (capabilities.isMobile) {
      // On mobile: Drive Preview Embed > External Provider View > Download
      chain.push(GoogleDrivePreviewStrategy);
      chain.push(ExternalProviderStrategy);
      chain.push(DownloadFallbackStrategy);
    } else {
      // On desktop: Drive Preview Embed > Blob Embed (if supported) > External > Download
      chain.push(GoogleDrivePreviewStrategy);
      if (capabilities.pdfViewerEnabled) {
        chain.push(BlobEmbedStrategy);
      }
      chain.push(ExternalProviderStrategy);
      chain.push(DownloadFallbackStrategy);
    }
  } else {
    // Other file types (spreadsheets, docs, CAD, generic)
    chain.push(GoogleDrivePreviewStrategy);
    chain.push(ExternalProviderStrategy);
    chain.push(DownloadFallbackStrategy);
  }

  // Filter only strategies that declare support for this specific fileMeta
  return chain.filter(s => s.isSupported(capabilities, fileMeta || {}));
}

/**
 * Get preferred cached strategy if recorded
 */
export function getCachedStrategyId(platformKey, category) {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(`${STRATEGY_CACHE_KEY_PREFIX}${platformKey}_${category}`);
  } catch (_) {
    return null;
  }
}

/**
 * Cache successful strategy
 */
export function cacheSuccessfulStrategy(platformKey, category, strategyId) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(`${STRATEGY_CACHE_KEY_PREFIX}${platformKey}_${category}`, strategyId);
  } catch (_) {}
}

/**
 * Resolves optimal strategy and prepares viewing metadata
 */
export async function resolveDocumentViewPlan(fileMeta, token, capabilities = detectBrowserCapabilities()) {
  const category = inferFileCategory(fileMeta?.fileName, fileMeta?.mimeType);
  const platformKey = capabilities.isMobile ? (capabilities.isAndroid ? 'android' : capabilities.isIOS ? 'ios' : 'mobile') : 'desktop';
  const chain = getStrategyChainForFile(fileMeta, capabilities);

  const fallbackLogs = [];

  for (const strategy of chain) {
    try {
      const srcUrl = await strategy.resolveUrl(fileMeta, token);
      if (srcUrl) {
        cacheSuccessfulStrategy(platformKey, category, strategy.id);
        return {
          success: true,
          strategyId: strategy.id,
          strategyName: strategy.name,
          renderMode: strategy.renderMode,
          srcUrl,
          downloadUrl: DownloadFallbackStrategy.resolveUrl(fileMeta),
          externalUrl: ExternalProviderStrategy.resolveUrl(fileMeta),
          category,
          platformKey,
          fallbackLogs
        };
      } else {
        fallbackLogs.push({ strategyId: strategy.id, reason: 'Empty URL returned' });
      }
    } catch (err) {
      fallbackLogs.push({ strategyId: strategy.id, reason: err.message || 'Resolution error' });
    }
  }

  // If all primary strategies fail, return the ultimate download fallback
  return {
    success: false,
    strategyId: DownloadFallbackStrategy.id,
    strategyName: DownloadFallbackStrategy.name,
    renderMode: RENDER_MODES.DOWNLOAD_FALLBACK,
    srcUrl: DownloadFallbackStrategy.resolveUrl(fileMeta),
    downloadUrl: DownloadFallbackStrategy.resolveUrl(fileMeta),
    externalUrl: ExternalProviderStrategy.resolveUrl(fileMeta),
    category,
    platformKey,
    fallbackLogs
  };
}
