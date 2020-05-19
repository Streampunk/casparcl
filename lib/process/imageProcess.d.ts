import { clContext as nodenCLContext, KernelParams, RunTimings } from 'nodencl';
export declare abstract class ProcessImpl {
    protected readonly name: string;
    protected readonly width: number;
    protected readonly height: number;
    readonly kernel: string;
    readonly programName: string;
    readonly globalWorkItems = 0;
    constructor(name: string, width: number, height: number, kernel: string, programName: string);
    abstract init(): Promise<void>;
    getNumBytesRGBA(): number;
    getGlobalWorkItems(): Uint32Array;
    abstract getKernelParams(params: KernelParams, clQueue: number): Promise<KernelParams>;
}
export default class ImageProcess {
    private readonly clContext;
    private readonly processImpl;
    private program;
    constructor(clContext: nodenCLContext, processImpl: ProcessImpl);
    init(): Promise<void>;
    run(params: KernelParams, clQueue: number): Promise<RunTimings>;
}
