import { ProcessImpl } from './imageProcess';
import { KernelParams } from 'nodencl';
export default class Mix extends ProcessImpl {
    constructor(width: number, height: number);
    init(): Promise<void>;
    getKernelParams(params: KernelParams): Promise<KernelParams>;
}
