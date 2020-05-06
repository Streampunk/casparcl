/// <reference types="node" />
import { clContext as nodenCLContext, OpenCLBuffer, ImageDims, RunTimings } from 'nodencl';
import { PackImpl, Interlace } from './packer';
export declare class ToRGBA {
    private readonly clContext;
    private readonly loader;
    private readonly numBytes;
    private readonly numBytesRGBA;
    private readonly totalBytes;
    constructor(clContext: nodenCLContext, colSpecRead: string, colSpecWrite: string, readImpl: PackImpl);
    init(): Promise<void>;
    getNumBytes(): Array<number>;
    getNumBytesRGBA(): number;
    getTotalBytes(): number;
    createSources(): Promise<Array<OpenCLBuffer>>;
    createDest(imageDims: ImageDims): Promise<OpenCLBuffer>;
    loadFrame(input: Buffer | Array<Buffer>, sources: Array<OpenCLBuffer>, clQueue?: number | undefined): Promise<Array<void>>;
    processFrame(sources: Array<OpenCLBuffer>, dest: OpenCLBuffer, clQueue?: number): Promise<RunTimings>;
}
export declare class FromRGBA {
    private readonly clContext;
    private readonly width;
    private readonly height;
    private readonly saver;
    private readonly numBytes;
    private readonly numBytesRGBA;
    private readonly totalBytes;
    private readonly srcWidth;
    private readonly srcHeight;
    private resizer;
    private rgbaSz;
    constructor(clContext: nodenCLContext, colSpecRead: string, writeImpl: PackImpl, srcWidth?: number, srcHeight?: number);
    init(): Promise<void>;
    getNumBytes(): Array<number>;
    getNumBytesRGBA(): number;
    getTotalBytes(): number;
    createDests(): Promise<Array<OpenCLBuffer>>;
    processFrame(source: OpenCLBuffer, dests: Array<OpenCLBuffer>, clQueue?: number, interlace?: Interlace): Promise<RunTimings>;
    saveFrame(output: OpenCLBuffer | Array<OpenCLBuffer>, clQueue?: number | undefined): Promise<Array<void>>;
}
