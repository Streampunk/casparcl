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

const yuv422p8Kernel = `
  __kernel void read(__global uchar8* restrict inputY,
                     __global uchar4* restrict inputU,
                     __global uchar4* restrict inputV,
                     __global float4* restrict output,
                     __private unsigned int width,
                     __constant float4* restrict colMatrix,
                     __global float* restrict gammaLut,
                     __constant float4* restrict gamutMatrix) {
    uint item = get_global_id(0);
    bool lastItemOnLine = get_local_id(0) == get_local_size(0) - 1;

    // 64 output pixels per workItem = 8 input luma uchar8s per work item, 8 each u & v uchar4s per work item
    uint numPixels = lastItemOnLine && (0 != width % 8) ? width % 64 : 64;
    uint numLoops = numPixels / 8;
    uint remain = numPixels % 8;

    uint inOff = 8 * item;
    uint outOff = width * get_group_id(0) + get_local_id(0) * 64;

    float4 colMatR = colMatrix[0];
    float4 colMatG = colMatrix[1];
    float4 colMatB = colMatrix[2];

    // optimise loading of the 3x3 gamut matrix
    float4 gamutMat0 = gamutMatrix[0];
    float4 gamutMat1 = gamutMatrix[1];
    float4 gamutMat2 = gamutMatrix[2];
    float3 gamutMatR = (float3)(gamutMat0.s0, gamutMat0.s1, gamutMat0.s2);
    float3 gamutMatG = (float3)(gamutMat0.s3, gamutMat1.s0, gamutMat1.s1);
    float3 gamutMatB = (float3)(gamutMat1.s2, gamutMat1.s3, gamutMat2.s0);

    for (uint i=0; i<numLoops; ++i) {
      uchar8 y = inputY[inOff];
      uchar4 u = inputU[inOff];
      uchar4 v = inputV[inOff];

      uchar4 yuva[8];
      yuva[0] = (uchar4)(y.s0, u.s0, v.s0, 1);
      yuva[1] = (uchar4)(y.s1, u.s0, v.s0, 1);
      yuva[2] = (uchar4)(y.s2, u.s1, v.s1, 1);
      yuva[3] = (uchar4)(y.s3, u.s1, v.s1, 1);
      yuva[4] = (uchar4)(y.s4, u.s2, v.s2, 1);
      yuva[5] = (uchar4)(y.s5, u.s2, v.s2, 1);
      yuva[6] = (uchar4)(y.s6, u.s3, v.s3, 1);
      yuva[7] = (uchar4)(y.s7, u.s3, v.s3, 1);

      for (uint p=0; p<8; ++p) {
        float4 yuva_f = convert_float4(yuva[p]);
        float3 rgb;
        rgb.s0 = gammaLut[convert_ushort_sat_rte(dot(yuva_f, colMatR) * 65535.0f)];
        rgb.s1 = gammaLut[convert_ushort_sat_rte(dot(yuva_f, colMatG) * 65535.0f)];
        rgb.s2 = gammaLut[convert_ushort_sat_rte(dot(yuva_f, colMatB) * 65535.0f)];

        float4 rgba;
        rgba.s0 = dot(rgb, gamutMatR);
        rgba.s1 = dot(rgb, gamutMatG);
        rgba.s2 = dot(rgb, gamutMatB);
        rgba.s3 = 1.0f;
        output[outOff+p] = rgba;
      }

      inOff++;
      outOff+=8;
    }

    if (remain > 0) {
      uchar8 y = inputY[inOff];
      uchar4 u = inputU[inOff];
      uchar4 v = inputV[inOff];

      uchar4 yuva[6];
      yuva[0] = (uchar4)(y.s0, u.s0, v.s0, 1);
      yuva[1] = (uchar4)(y.s1, u.s0, v.s0, 1);

      if (remain > 2) {
        yuva[2] = (uchar4)(y.s2, u.s1, v.s1, 1);
        yuva[3] = (uchar4)(y.s3, u.s1, v.s1, 1);

        if (remain > 4) {
          yuva[4] = (uchar4)(y.s4, u.s2, v.s2, 1);
          yuva[5] = (uchar4)(y.s5, u.s2, v.s2, 1);
        }
      }

      for (uint p=0; p<remain; ++p) {
        float4 yuva_f = convert_float4(yuva[p]);
        float3 rgb;
        rgb.s0 = gammaLut[convert_ushort_sat_rte(dot(yuva_f, colMatR) * 65535.0f)];
        rgb.s1 = gammaLut[convert_ushort_sat_rte(dot(yuva_f, colMatG) * 65535.0f)];
        rgb.s2 = gammaLut[convert_ushort_sat_rte(dot(yuva_f, colMatB) * 65535.0f)];

        float4 rgba;
        rgba.s0 = dot(rgb, gamutMatR);
        rgba.s1 = dot(rgb, gamutMatG);
        rgba.s2 = dot(rgb, gamutMatB);
        rgba.s3 = 1.0f;
        output[outOff+p] = rgba;
      }
    }
  }

  __kernel void write(__global float4* restrict input,
                      __global uchar8* restrict outputY,
                      __global uchar4* restrict outputU,
                      __global uchar4* restrict outputV,
                      __private unsigned int width,
                      __constant float4* restrict colMatrix,
                      __global float* restrict gammaLut) {
    uint item = get_global_id(0);
    bool lastItemOnLine = get_local_id(0) == get_local_size(0) - 1;

    // 64 input pixels per workItem = 8 input luma uchar8s per work item, 8 each u & v uchar4s per work item
    uint numPixels = lastItemOnLine && (0 != width % 8) ? width % 64 : 64;
    uint numLoops = numPixels / 8;
    uint remain = numPixels % 8;

    uint inOff = width * get_group_id(0) + get_local_id(0) * 64;
    uint outOff = 8 * item;

    if (64 != numPixels) {
      // clear the output buffers for the last item, partially overwritten below
      uint clearOff = outOff;
      for (uint i=0; i<numLoops; ++i) {
        outputY[clearOff] = (uchar8)(64, 64, 64, 64, 64, 64, 64, 64);
        outputU[clearOff] = (uchar4)(512, 512, 512, 512);
        outputV[clearOff] = (uchar4)(512, 512, 512, 512);
        clearOff++;
      }
    }

    float4 matY = colMatrix[0];
    float4 matU = colMatrix[1];
    float4 matV = colMatrix[2];

    for (uint i=0; i<numLoops; ++i) {
      uchar3 yuv[8];

      for (uint p=0; p<8; ++p) {
        float4 rgba_l = input[inOff+p];
        float4 rgba;
        rgba.s0 = gammaLut[convert_ushort_sat_rte(rgba_l.s0 * 65535.0f)];
        rgba.s1 = gammaLut[convert_ushort_sat_rte(rgba_l.s1 * 65535.0f)];
        rgba.s2 = gammaLut[convert_ushort_sat_rte(rgba_l.s2 * 65535.0f)];
        rgba.s3 = 1.0f;

        yuv[p].s0 = convert_ushort_sat_rte(dot(rgba, matY));
        yuv[p].s1 = convert_ushort_sat_rte(dot(rgba, matU));
        yuv[p].s2 = convert_ushort_sat_rte(dot(rgba, matV));
      }

      uchar8 y = (uchar8)(yuv[0].s0, yuv[1].s0, yuv[2].s0, yuv[3].s0, yuv[4].s0, yuv[5].s0, yuv[6].s0, yuv[7].s0);
      uchar4 u = (uchar4)(yuv[0].s1, yuv[2].s1, yuv[4].s1, yuv[6].s1);
      uchar4 v = (uchar4)(yuv[0].s2, yuv[2].s2, yuv[4].s2, yuv[6].s2);
      outputY[outOff] = y;
      outputU[outOff] = u;
      outputV[outOff] = v;

      inOff+=8;
      outOff++;
    }

    if (remain > 0) {
      uchar8 y = (uchar8)(64, 64, 64, 64, 64, 64, 64, 64);
      uchar4 u = (uchar4)(512, 512, 512, 512);
      uchar4 v = (uchar4)(512, 512, 512, 512);

      uchar3 yuv[6];
      for (uint p=0; p<remain; ++p) {
        float4 rgba_l = input[inOff+p];
        float4 rgba;
        rgba.s0 = gammaLut[convert_ushort_sat_rte(rgba_l.s0 * 65535.0f)];
        rgba.s1 = gammaLut[convert_ushort_sat_rte(rgba_l.s1 * 65535.0f)];
        rgba.s2 = gammaLut[convert_ushort_sat_rte(rgba_l.s2 * 65535.0f)];
        rgba.s3 = 1.0;

        yuv[p].s0 = convert_ushort_sat_rte(round(dot(rgba, matY)));
        yuv[p].s1 = convert_ushort_sat_rte(round(dot(rgba, matU)));
        yuv[p].s2 = convert_ushort_sat_rte(round(dot(rgba, matV)));
      }

      y.s0 = yuv[0].s0;
      y.s1 = yuv[1].s0;
      u.s0 = yuv[0].s1;
      v.s0 = yuv[0].s2;
      if (remain > 2) {
        y.s2 = yuv[2].s0;
        y.s3 = yuv[3].s0;
        u.s1 = yuv[2].s1;
        v.s1 = yuv[2].s2;
        if (remain > 4) {
          y.s4 = yuv[4].s0;
          y.s5 = yuv[5].s0;
          u.s1 = yuv[4].s1;
          v.s1 = yuv[4].s2;
        }
      }

      outputY[outOff] = y;
      outputU[outOff] = u;
      outputV[outOff] = v;
    }
  }
`;

function getPitch(width) {
  return width + 7 - ((width - 1) % 8);
}

function getPitchBytes(width) {
  return getPitch(width);
}

function getTotalBytes(width, height) {
  return getPitchBytes(width) * height * 2;
}

function fillBuf(buf, width, height) {
  const lumaPitchBytes = getPitchBytes(width);
  const chromaPitchBytes = lumaPitchBytes / 2;
  let lOff = 0;
  let uOff = lumaPitchBytes * height;
  let vOff = uOff + chromaPitchBytes * height;

  buf.fill(0);
  let Y=16;
  const Cb=128;
  const Cr=128;
  for (let y=0; y<height; ++y) {
    let xlOff = 0;
    let xcOff = 0;
    for (let x=0; x<width; x+=2) {
      buf.writeUInt8(Y, lOff + xlOff);
      buf.writeUInt8(Y+1, lOff + xlOff + 2);
      xlOff += 4;
    
      buf.writeUInt8(Cb, uOff + xcOff);
      buf.writeUInt8(Cr, vOff + xcOff);
      xcOff += 2;
      Y = (234==Y)?16:Y+=2;
    }
    lOff += lumaPitchBytes;
    uOff += chromaPitchBytes;
    vOff += chromaPitchBytes;
  }
}

function dumpBuf(buf, width, height, numLines) {
  const lumaPitchBytes = getPitchBytes(width);
  const chromaPitchBytes = lumaPitchBytes / 2;

  let yLineOff = 0;
  let uLineOff = lumaPitchBytes * height;
  let vLineOff = uLineOff + uLineOff / 2;
  function getYHex(off) { return buf.readUInt8(yLineOff + off * 2).toString(16); }
  function getUHex(off) { return buf.readUInt8(uLineOff + off).toString(16); }
  function getVHex(off) { return buf.readUInt8(vLineOff + off).toString(16); }

  for (let l = 0; l < numLines; ++l) {
    yLineOff = lumaPitchBytes * l;
    uLineOff = yLineOff + lumaPitchBytes * height;
    vLineOff = uLineOff + lumaPitchBytes * height / 2;
    console.log(`Line ${l}: ${getUHex(0)}, ${getYHex(0)}, ${getVHex(0)}, ${getYHex(1)}; ${getUHex(2)}, ${getYHex(2)}, ${getVHex(2)}, ${getYHex(3)}; ${getUHex(4)}, ${getYHex(4)}, ${getVHex(4)}, ${getYHex(5)}; ${getUHex(6)}, ${getYHex(6)}, ${getVHex(6)}, ${getYHex(7)}`);
  }
}

function reader(width, height) {
  this.width = width;
  this.height = height;
  return this;
}

// process one image line per work group
reader.prototype.pixelsPerWorkItem = 64;
reader.prototype.getWorkItemsPerGroup = function() { return getPitch(this.width) / this.pixelsPerWorkItem; }
reader.prototype.getGlobalWorkItems = function() { return this.getWorkItemsPerGroup() * this.height; }

reader.prototype.numBits = 8;
reader.prototype.lumaBlack = 16;
reader.prototype.lumaWhite = 235;
reader.prototype.chromaRange = 224;

reader.prototype.kernel = yuv422p8Kernel;
reader.prototype.getKernelParams = function(params) {
  return {
    inputY: params.sources[0],
    inputU: params.sources[1],
    inputV: params.sources[2],
    output: params.dest,
    width: this.width
  }
}

function writer(width, height) {
  this.width = width;
  this.height = height;
  return this;
}

// process one image line per work group
writer.prototype.pixelsPerWorkItem = 64;
writer.prototype.getWorkItemsPerGroup = function() { return getPitch(this.width) / this.pixelsPerWorkItem; }
writer.prototype.getGlobalWorkItems = function() { return this.getWorkItemsPerGroup() * this.height; }

writer.prototype.numBits = 8;
writer.prototype.lumaBlack = 16;
writer.prototype.lumaWhite = 235;
writer.prototype.chromaRange = 224;

writer.prototype.kernel = yuv422p8Kernel;
writer.prototype.getKernelParams = function(params) {
  return {
    input: params.source,
    outputY: params.dests[0],
    outputU: params.dests[1],
    outputV: params.dests[2],
    width: this.width
  }
}

module.exports = {
  reader,
  writer,

  getPitchBytes,
  getTotalBytes,
  fillBuf,
  dumpBuf
};