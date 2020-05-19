/// <reference types="node" />
import { PackImpl } from './packer';
import { KernelParams } from 'nodencl';
export declare function fillBuf(buf: Buffer, width: number, height: number): void;
export declare function dumpBuf(buf: Buffer, width: number, height: number, numLines: number): void;
export declare class Reader extends PackImpl {
    constructor(width: number, height: number);
    getKernelParams(params: KernelParams): KernelParams;
}
export declare class Writer extends PackImpl {
    constructor(width: number, height: number, interlaced: boolean);
    getKernelParams(params: KernelParams): KernelParams;
}
