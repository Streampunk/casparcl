import { SourceFrame } from '../chanLayer';
import { clContext as nodenCLContext, OpenCLBuffer } from 'nodencl';
import { ConsumerFactory, Consumer } from './consumer';
import { RedioPipe, RedioStream } from 'redioactive';
export declare class MacadamConsumer implements Consumer {
    private readonly channel;
    private clContext;
    private playback;
    private fromRGBA;
    private vidProcess;
    private vidSaver;
    private spout;
    private clDests;
    private field;
    private frameNumber;
    private readonly latency;
    constructor(channel: number, context: nodenCLContext);
    initialise(pipe: RedioPipe<SourceFrame>): Promise<RedioStream<OpenCLBuffer> | null>;
}
export declare class MacadamConsumerFactory implements ConsumerFactory<MacadamConsumer> {
    private clContext;
    constructor(clContext: nodenCLContext);
    createConsumer(channel: number): MacadamConsumer;
}
