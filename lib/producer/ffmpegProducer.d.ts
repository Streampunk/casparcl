import { SourceFrame } from '../chanLayer';
import { ProducerFactory, Producer } from './producer';
import { clContext as nodenCLContext } from 'nodencl';
import { RedioPipe } from 'redioactive';
export declare class FFmpegProducer implements Producer {
    private readonly id;
    private params;
    private clContext;
    private demuxer;
    private readonly decoders;
    private readonly filterers;
    private vidSource;
    private vidDecode;
    private vidFilter;
    private vidLoader;
    private vidProcess;
    private toRGBA;
    constructor(id: string, params: string[], context: nodenCLContext);
    initialise(): Promise<RedioPipe<SourceFrame> | null>;
}
export declare class FFmpegProducerFactory implements ProducerFactory<FFmpegProducer> {
    private clContext;
    constructor(clContext: nodenCLContext);
    createProducer(id: string, params: string[]): FFmpegProducer;
}
