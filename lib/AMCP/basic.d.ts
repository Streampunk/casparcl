import { Commands, ChanLayer } from './commands';
declare class Player {
    private readonly id;
    private demuxer;
    private readonly decoders;
    private readonly filterers;
    private vidSource;
    private vidDecode;
    private vidFilter;
    constructor(id: string);
    setURL(url: string): Promise<void>;
    play(): void;
    stop(): void;
}
export declare class Basic {
    private readonly players;
    constructor();
    /** Add the supported basic transport commands */
    addCmds(commands: Commands): void;
    /** Find the player instance for the specified layer */
    findPlayer(cl: ChanLayer): Player | undefined;
    /** Find or create if not found a player instance for the specified layer */
    createPlayer(cl: ChanLayer): Player;
    /**
     * Loads a producer in the background and prepares it for playout. If no layer is specified the default layer index will be used.
     *
     * _clip_ will be parsed by available registered producer factories. If a successfully match is found, the producer will be loaded into the background.
     * If a file with the same name (extension excluded) but with the additional postfix _a is found this file will be used as key for the main clip.
     *
     * _loop_ will cause the clip to loop.
     * When playing and looping the clip will start at _frame_.
     * When playing and loop the clip will end after _frames_ number of frames.
     *
     * _auto_ will cause the clip to automatically start when foreground clip has ended (without play).
     * The clip is considered "started" after the optional transition has ended.
     *
     * Note: only one clip can be queued to play automatically per layer.
     */
    loadbg(chanLay: ChanLayer, params: string[]): boolean;
    /**
     * Loads a clip to the foreground and plays the first frame before pausing.
     * If any clip is playing on the target foreground then this clip will be replaced.
     */
    load(chanLay: ChanLayer, params: string[]): boolean;
    /**
     * Moves clip from background to foreground and starts playing it.
     * If a transition (see LOADBG) is prepared, it will be executed.
     * If additional parameters (see LOADBG) are provided then the provided clip will first be loaded to the background.
     */
    play(chanLay: ChanLayer, params: string[]): boolean;
    /** Pauses playback of the foreground clip on the specified layer. The RESUME command can be used to resume playback again. */
    pause(chanLay: ChanLayer, params: string[]): boolean;
    /** Resumes playback of a foreground clip previously paused with the PAUSE command. */
    resume(chanLay: ChanLayer, params: string[]): boolean;
    /** Removes the foreground clip of the specified layer */
    stop(chanLay: ChanLayer, params: string[]): boolean;
    /**
     * Removes all clips (both foreground and background) of the specified layer.
     * If no layer is specified then all layers in the specified video_channel are cleared.
     */
    clear(chanLay: ChanLayer, params: string[]): boolean;
}
export {};