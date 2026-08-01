/**
 * `BarcodeDetector` non è ancora nella libreria DOM di TypeScript (API
 * sperimentale, solo Chrome/Chromium su Android — non su iOS/Safari). Qui la
 * dichiarazione minima che serve a `CameraScanner.tsx`; il codice verifica
 * comunque `'BarcodeDetector' in window` prima di usarla, quindi questo tipo
 * descrive un'API che potrebbe non esistere a runtime.
 */
interface BarcodeDetectorOptions {
  formats?: string[];
}

interface DetectedBarcode {
  rawValue: string;
  format: string;
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  static getSupportedFormats(): Promise<string[]>;
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector;
}
