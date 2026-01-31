declare module 'demucs-web' {
  export interface DemucsProcessorOptions {
    ort?: any;
    modelPath?: string;
    sessionOptions?: Record<string, any>;
    onProgress?: (info: { progress: number; currentSegment: number; totalSegments: number }) => void;
    onLog?: (type: string, message: string) => void;
    onDownloadProgress?: (loaded: number, total: number) => void;
  }

  export interface StemOutput {
    left: Float32Array;
    right: Float32Array;
  }

  export interface SeparationResult {
    drums: StemOutput;
    bass: StemOutput;
    other: StemOutput;
    vocals: StemOutput;
  }

  export class DemucsProcessor {
    constructor(options?: DemucsProcessorOptions);
    loadModel(modelPathOrBuffer?: string | ArrayBuffer): Promise<any>;
    separate(leftChannel: Float32Array, rightChannel: Float32Array): Promise<SeparationResult>;
  }

  export const CONSTANTS: {
    SAMPLE_RATE: number;
    FFT_SIZE: number;
    HOP_SIZE: number;
    TRAINING_SAMPLES: number;
    MODEL_SPEC_BINS: number;
    MODEL_SPEC_FRAMES: number;
    SEGMENT_OVERLAP: number;
    TRACKS: string[];
    DEFAULT_MODEL_URL: string;
  };

  export function stft(input: Float32Array, fftSize: number, hopSize: number): any;
  export function istft(
    real: Float32Array,
    imag: Float32Array,
    numFrames: number,
    numBins: number,
    fftSize: number,
    hopSize: number,
    length: number
  ): Float32Array;
  export function reflectPad(input: Float32Array, padLeft: number, padRight: number): Float32Array;
  export function getHannWindow(size: number): Float32Array;
  export function fft(real: Float32Array, imag: Float32Array): void;
  export function ifft(real: Float32Array, imag: Float32Array): void;
  export function standaloneMask(freqOutput: Float32Array): any[];
  export function standaloneIspec(trackSpec: any, targetLength: number): StemOutput;
  export function prepareModelInput(leftChannel: Float32Array, rightChannel: Float32Array): any;
}
