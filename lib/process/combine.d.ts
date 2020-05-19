import { ProcessImpl } from './imageProcess';
import { KernelParams } from 'nodencl';
export default class Combine extends ProcessImpl {
    private readonly numOverlays;
    constructor(width: number, height: number, numOverlays: number);
    init(): Promise<void>;
    getKernelParams(params: KernelParams): Promise<KernelParams>;
}
