import { PackImpl } from './packer';
import { KernelParams, OpenCLBuffer } from 'nodencl';
export declare function getPitchBytes(width: number): number;
export declare function fillBuf(buf: OpenCLBuffer, width: number, height: number): void;
export declare function dumpBuf(buf: OpenCLBuffer, width: number, numLines: number): void;
export declare class Reader extends PackImpl {
    constructor(width: number, height: number);
    getKernelParams(params: KernelParams): KernelParams;
}
export declare class Writer extends PackImpl {
    constructor(width: number, height: number, interlaced: boolean);
    getKernelParams(params: KernelParams): KernelParams;
}
