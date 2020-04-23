export interface ChanLayer {
    valid: boolean;
    channel: number;
    layer: number;
}
interface CmdEntry {
    cmd: string;
    fn: (chanLayer: ChanLayer, params: string[]) => boolean;
}
export declare class Commands {
    private readonly map;
    constructor();
    add(entry: CmdEntry): void;
    process(command: string[]): boolean;
}
export {};
