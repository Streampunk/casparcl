import { clContext as nodenCLContext } from 'nodencl';
import { ChanLayer, SourceFrame } from '../chanLayer';
import { RedioPipe } from 'redioactive';
export interface Producer {
    initialise(): Promise<RedioPipe<SourceFrame> | null>;
}
export interface ProducerFactory<T extends Producer> {
    createProducer(id: string, params: string[]): T;
}
export declare class InvalidProducerError extends Error {
    constructor(message?: string);
}
export declare class ProducerRegistry {
    private readonly producerFactories;
    constructor(clContext: nodenCLContext);
    createSource(chanLay: ChanLayer, params: string[]): Promise<RedioPipe<SourceFrame> | null>;
}
