import { clContext as nodenCLContext, OpenCLBuffer, KernelParams, RunTimings } from 'nodencl';
export default class Switch {
    private readonly clContext;
    private readonly width;
    private readonly height;
    private readonly numInputs;
    private readonly numOverlays;
    private xform0;
    private xform1;
    private rgbaXf0;
    private rgbaXf1;
    private rgbaMx;
    private mixer;
    private wiper;
    private combiner;
    constructor(clContext: nodenCLContext, width: number, height: number, numInputs: number, numOverlays: number);
    init(): Promise<void>;
    processFrame(inParams: Array<KernelParams>, mixParams: KernelParams, overlays: Array<OpenCLBuffer>, output: OpenCLBuffer, clQueue: number): Promise<RunTimings>;
}
