import Packer, { PackImpl } from './packer';
import { clContext as nodenCLContext, KernelParams, RunTimings } from 'nodencl';
export declare class Loader extends Packer {
    private readonly gammaArray;
    private readonly colMatrixArray;
    private readonly gamutMatrixArray;
    private gammaLut;
    private colMatrix;
    private gamutMatrix;
    constructor(clContext: nodenCLContext, colSpec: string, outColSpec: string, packImpl: PackImpl);
    init(): Promise<void>;
    run(params: KernelParams, queueNum: number): Promise<RunTimings>;
}
export declare class Saver extends Packer {
    private readonly gammaArray;
    private readonly colMatrixArray;
    private gammaLut;
    private colMatrix;
    constructor(clContext: nodenCLContext, colSpec: string, packImpl: PackImpl);
    init(): Promise<void>;
    run(params: KernelParams, queueNum: number): Promise<RunTimings>;
}
