import { ChanLayer } from '../chanLayer';
interface CmdEntry {
    cmd: string;
    fn: (chanLayer: ChanLayer, params: string[]) => Promise<boolean>;
}
export declare class Commands {
    private readonly map;
    constructor();
    add(entry: CmdEntry): void;
    process(command: string[]): Promise<boolean>;
}
export {};
