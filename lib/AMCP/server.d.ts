import { Commands } from './commands';
export declare function processCommand(command: string[] | null, token?: string): string;
export declare function start(commands?: Commands): Promise<string>;
export declare function stop(): Promise<string>;
export declare function version(version: string): void;
