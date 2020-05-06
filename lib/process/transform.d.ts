import { ProcessImpl } from './imageProcess';
import { clContext as nodenCLContext, OpenCLBuffer, KernelParams } from 'nodencl';
export default class Transform extends ProcessImpl {
    clContext: nodenCLContext;
    transformMatrix: Array<Float32Array>;
    transformArray: Float32Array;
    matrixBuffer: OpenCLBuffer | null;
    constructor(clContext: nodenCLContext, width: number, height: number);
    private updateMatrix;
    init(): Promise<void>;
    getKernelParams(params: KernelParams, clQueue: number): Promise<KernelParams>;
}
