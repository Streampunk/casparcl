import { clContext as nodenCLContext, OpenCLProgram, KernelParams, RunTimings } from 'nodencl';
export declare enum Interlace {
    Progressive = 0,
    TopField = 1,
    BottomField = 3
}
export declare abstract class PackImpl {
    protected readonly name: string;
    protected readonly width: number;
    protected readonly height: number;
    protected interlaced: boolean;
    readonly kernel: string;
    readonly programName: string;
    numBits: number;
    lumaBlack: number;
    lumaWhite: number;
    chromaRange: number;
    protected isRGB: boolean;
    protected numBytes: Array<number>;
    protected globalWorkItems: number;
    protected workItemsPerGroup: number;
    constructor(name: string, width: number, height: number, kernel: string, programName: string);
    getWidth(): number;
    getHeight(): number;
    getNumBytes(): Array<number>;
    getNumBytesRGBA(): number;
    getIsRGB(): boolean;
    getTotalBytes(): number;
    getGlobalWorkItems(): number;
    getWorkItemsPerGroup(): number;
    abstract getKernelParams(params: KernelParams): KernelParams;
}
export default abstract class Packer {
    protected readonly clContext: nodenCLContext;
    protected readonly packImpl: PackImpl;
    protected program: OpenCLProgram | null;
    constructor(clContext: nodenCLContext, packImpl: PackImpl);
    init(): Promise<void>;
    abstract run(kernelParams: KernelParams, queueNum: number): Promise<RunTimings>;
}
