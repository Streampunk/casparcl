export interface Responses {
    [command: string]: ((req: string[] | null) => string) | Responses;
}
export declare const responses218: Responses;
export declare const responses207: Responses;
export declare const responses220: Responses;
