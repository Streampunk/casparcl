"use strict";
/* Copyright 2019 Streampunk Media Ltd.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/
Object.defineProperty(exports, "__esModule", { value: true });
const packer_1 = require("./packer");
const bgra8Kernel = `
  __kernel void read(__global uchar4* restrict input,
                     __global float4* restrict output,
                     __private unsigned int width,
                     __global float* restrict gammaLut,
                     __constant float4* restrict gamutMatrix) {
    uint item = get_global_id(0);
    bool lastItemOnLine = get_local_id(0) == get_local_size(0) - 1;

    // 64 output pixels per workItem
    uint numPixels = lastItemOnLine && (0 != width % 64) ? width % 64 : 64;
    uint numLoops = numPixels;

    uint inOff = 64 * item;
    uint outOff = width * get_group_id(0) + get_local_id(0) * 64;

    // optimise loading of the 3x3 gamut matrix
    float4 gamutMat0 = gamutMatrix[0];
    float4 gamutMat1 = gamutMatrix[1];
    float4 gamutMat2 = gamutMatrix[2];
    float3 gamutMatR = (float3)(gamutMat0.s0, gamutMat0.s1, gamutMat0.s2);
    float3 gamutMatG = (float3)(gamutMat0.s3, gamutMat1.s0, gamutMat1.s1);
    float3 gamutMatB = (float3)(gamutMat1.s2, gamutMat1.s3, gamutMat2.s0);

    for (uint i=0; i<numLoops; ++i) {
      uchar4 bgra8 = input[inOff];
      float4 bgra_f = convert_float4(bgra8);

      float3 rgb;
      rgb.s0 = gammaLut[convert_ushort_sat_rte(bgra_f.s2 * 65535.0f / 255.0f)];
      rgb.s1 = gammaLut[convert_ushort_sat_rte(bgra_f.s1 * 65535.0f / 255.0f)];
      rgb.s2 = gammaLut[convert_ushort_sat_rte(bgra_f.s0 * 65535.0f / 255.0f)];

      float4 rgba;
      rgba.s0 = dot(rgb, gamutMatR);
      rgba.s1 = dot(rgb, gamutMatG);
      rgba.s2 = dot(rgb, gamutMatB);
      rgba.s3 = gammaLut[convert_ushort_sat_rte(bgra_f.s3 * 65535.0f / 255.0f)];
      output[outOff] = rgba;

      inOff++;
      outOff++;
    }
  }

  __kernel void write(__global float4* restrict input,
                      __global uchar4* restrict output,
                      __private unsigned int width,
                      __private unsigned int interlace,
                      __global float* restrict gammaLut) {
    bool lastItemOnLine = get_local_id(0) == get_local_size(0) - 1;

    // 64 input pixels per workItem
    uint numPixels = lastItemOnLine && (0 != width % 64) ? width % 64 : 64;
    uint numLoops = numPixels;

    uint interlaceOff = (3 == interlace) ? 1 : 0;
		uint line = get_group_id(0) * ((0 == interlace) ? 1 : 2) + interlaceOff;
    uint inOff = width * line + get_local_id(0) * 64;
		uint outOff = width * line + get_local_id(0) * 64;

    for (uint i=0; i<numLoops; ++i) {
      uchar4 bgra;

      float4 rgba_l = input[inOff];
      float3 rgb_f;
      rgb_f.s0 = gammaLut[convert_ushort_sat_rte(rgba_l.s0 * 65535.0f)];
      rgb_f.s1 = gammaLut[convert_ushort_sat_rte(rgba_l.s1 * 65535.0f)];
      rgb_f.s2 = gammaLut[convert_ushort_sat_rte(rgba_l.s2 * 65535.0f)];

      bgra.s0 = convert_uchar_sat_rte(rgb_f.s2 * 255.0f);
      bgra.s1 = convert_uchar_sat_rte(rgb_f.s1 * 255.0f);
      bgra.s2 = convert_uchar_sat_rte(rgb_f.s0 * 255.0f);
      bgra.s3 = 255;
      output[outOff] = bgra;

      inOff++;
      outOff++;
    }
  }
`;
function getPitch(width) {
    return width;
}
function getPitchBytes(width) {
    return getPitch(width) * 4;
}
exports.getPitchBytes = getPitchBytes;
function fillBuf(buf, width, height) {
    const pitchBytes = getPitchBytes(width);
    let off = 0;
    buf.fill(0);
    const R = 16;
    const G = 16;
    const B = 16;
    const A = 255;
    for (let y = 0; y < height; ++y) {
        let xOff = 0;
        for (let x = 0; x < width; ++x) {
            buf.writeUInt8(B, off + xOff++);
            buf.writeUInt8(G, off + xOff++);
            buf.writeUInt8(R, off + xOff++);
            buf.writeUInt8(A, off + xOff++);
        }
        off += pitchBytes;
    }
}
exports.fillBuf = fillBuf;
function dumpBuf(buf, width, numLines) {
    const pitchBytes = getPitchBytes(width);
    let lineOff = 0;
    function getBHex(off) {
        return buf.readUInt8(lineOff + off * 4 + 0).toString(16);
    }
    function getGHex(off) {
        return buf.readUInt8(lineOff + off * 4 + 1).toString(16);
    }
    function getRHex(off) {
        return buf.readUInt8(lineOff + off * 4 + 2).toString(16);
    }
    function getAHex(off) {
        return buf.readUInt8(lineOff + off * 4 + 3).toString(16);
    }
    for (let l = 0; l < numLines; ++l) {
        lineOff = pitchBytes * l;
        console.log(`Line ${l}: ${getBHex(0)}, ${getGHex(0)}, ${getRHex(0)}, ${getAHex(0)}; ${getBHex(1)}, ${getGHex(1)}, ${getRHex(1)}, ${getAHex(1)}; ${getBHex(2)}, ${getGHex(2)}, ${getRHex(2)}, ${getAHex(2)}; ${getBHex(3)}, ${getGHex(3)}, ${getRHex(3)}, ${getAHex(3)}`);
    }
}
exports.dumpBuf = dumpBuf;
// process one image line per work group
const pixelsPerWorkItem = 64;
class Reader extends packer_1.PackImpl {
    constructor(width, height) {
        super('bgra8', width, height, bgra8Kernel, 'read');
        this.numBits = 8;
        this.lumaBlack = 16;
        this.lumaWhite = 235;
        this.chromaRange = 224;
        this.numBytes = [getPitchBytes(this.width) * this.height];
        this.workItemsPerGroup = getPitch(this.width) / pixelsPerWorkItem;
        this.globalWorkItems = this.workItemsPerGroup * this.height;
    }
    getKernelParams(params) {
        const srcArray = params.sources;
        if (srcArray.length !== 1)
            throw new Error(`Reader for ${this.name} requires 'sources' parameter with 1 OpenCL buffer`);
        return {
            input: srcArray[0],
            output: params.dest,
            width: this.width,
            gammaLut: params.gammaLut,
            gamutMatrix: params.gamutMatrix
        };
    }
}
exports.Reader = Reader;
class Writer extends packer_1.PackImpl {
    constructor(width, height, interlaced) {
        super('bgra8', width, height, bgra8Kernel, 'write');
        this.interlaced = interlaced;
        this.numBits = 8;
        this.lumaBlack = 16;
        this.lumaWhite = 235;
        this.chromaRange = 224;
        this.numBytes = [getPitchBytes(this.width) * this.height];
        this.workItemsPerGroup = getPitch(this.width) / pixelsPerWorkItem;
        this.globalWorkItems = (this.workItemsPerGroup * this.height) / (this.interlaced ? 2 : 1);
    }
    getKernelParams(params) {
        const dstArray = params.dests;
        if (dstArray.length !== 1)
            throw new Error(`Writer for ${this.name} requires 'dests' parameter with 1 OpenCL buffer`);
        return {
            input: params.source,
            output: dstArray[0],
            width: this.width,
            interlace: this.interlaced ? params.interlace : packer_1.Interlace.Progressive,
            gammaLut: params.gammaLut
        };
    }
}
exports.Writer = Writer;
