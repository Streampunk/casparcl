export declare function gamma2linearLUT(colSpec: string): Float32Array;
export declare function linear2gammaLUT(colSpec: string): Float32Array;
export declare function matrixMultiply(a: Float32Array[], b: Float32Array[]): Float32Array[];
export declare function ycbcr2rgbMatrix(colSpec: string, numBits: number, lumaBlack: number, lumaWhite: number, chrRange: number): Float32Array[];
export declare function rgb2ycbcrMatrix(colSpec: string, numBits: number, lumaBlack: number, lumaWhite: number, chrRange: number): Float32Array[];
export declare function rgb2rgbMatrix(srcColSpec: string, dstColSpec: string): Float32Array[];
export declare function matrixFlatten(a: Float32Array[]): Float32Array;
