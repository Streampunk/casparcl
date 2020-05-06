/// <reference types="node" />
import { OpenCLBuffer } from 'nodencl';
export interface ChanLayer {
    valid: boolean;
    channel: number;
    layer: number;
}
export interface SourceFrame {
    video: OpenCLBuffer;
    audio: Buffer;
    timestamp: number;
}
