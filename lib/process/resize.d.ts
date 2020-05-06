import { ProcessImpl } from './imageProcess';
import { clContext as nodenCLContext, KernelParams } from 'nodencl';
export default class Resize extends ProcessImpl {
    private readonly clContext;
    private flipH;
    private flipV;
    private flipArr;
    private readonly flipArrBytes;
    private flipVals;
    constructor(clContext: nodenCLContext, width: number, height: number);
    private updateFlip;
    init(): Promise<void>;
    getKernelParams(params: KernelParams, clQueue: number): Promise<KernelParams>;
}
