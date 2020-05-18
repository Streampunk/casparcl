import { clContext as nodenCLContext } from 'nodencl';
import { ChanLayer } from './chanLayer';
export declare class Channel {
    private readonly channel;
    private readonly producerRegistry;
    private readonly consumerRegistry;
    private foreground;
    private background;
    private spout;
    constructor(clContext: nodenCLContext, channel: number);
    createSource(chanLay: ChanLayer, params: string[]): Promise<boolean>;
    play(): Promise<boolean>;
}
