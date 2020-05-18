import { clContext as nodenCLContext, OpenCLBuffer } from 'nodencl';
import { SourceFrame } from '../chanLayer';
import { RedioPipe, RedioStream } from 'redioactive';
export interface Consumer {
    initialise(pipe: RedioPipe<SourceFrame>): Promise<RedioStream<OpenCLBuffer> | null>;
}
export interface ConsumerFactory<T extends Consumer> {
    createConsumer(channel: number): T;
}
export declare class InvalidConsumerError extends Error {
    constructor(message?: string);
}
export declare class ConsumerRegistry {
    private readonly consumerFactories;
    constructor(clContext: nodenCLContext);
    createSpout(channel: number, pipe: RedioPipe<SourceFrame>): Promise<RedioStream<OpenCLBuffer> | null>;
}
