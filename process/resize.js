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

const resizeKernel = `
  __constant sampler_t samplerIn =
    CLK_NORMALIZED_COORDS_TRUE |
    CLK_ADDRESS_CLAMP |
    CLK_FILTER_LINEAR;

  __constant sampler_t samplerOut =
    CLK_NORMALIZED_COORDS_FALSE |
    CLK_ADDRESS_CLAMP |
    CLK_FILTER_NEAREST;

  __kernel void resize(
    __read_only image2d_t input,
    __private float scale,
    __private float offsetX,
    __private float offsetY,
    __global float* restrict flip,
    __write_only image2d_t output) {

    int w = get_image_width(output);
    int h = get_image_height(output);

    int outX = get_global_id(0);
    int outY = get_global_id(1);
    int2 posOut = {outX, outY};

    float2 inPos = (float2)(outX / (float) w, outY / (float) h);
    float centreOffX = (-0.5f - offsetX) / scale + 0.5f;
    float centreOffY = (-0.5f - offsetY) / scale + 0.5f;
    float2 off = (float2)(fma(centreOffX, flip[1], flip[0]), fma(centreOffY, flip[3], flip[2]));
    float2 mul = (float2)(flip[1] / scale, flip[3] / scale);
    float2 posIn = fma(inPos, mul, off);

    float4 in = read_imagef(input, samplerIn, posIn);
    write_imagef(output, posOut, in);
  }
`;

function resize(params) {
  this.name = 'resize';
  this.flipH = false;
  this.flipV = false;
  return this;
}

resize.prototype.updateFlip = async function(flipH, flipV) {
  this.flipH = flipH;
  this.flipV = flipV;
  let flipArr = Float32Array.from([
    this.flipH ?  1.0 : 0.0,
    this.flipH ? -1.0 : 1.0,
    this.flipV ?  1.0 : 0.0,
    this.flipV ? -1.0 : 1.0
  ]);
  await this.flipVals.hostAccess('writeonly');
  Buffer.from(flipArr.buffer).copy(this.flipVals);
}

resize.prototype.init = async function(context) {
  this.flipVals = await context.createBuffer(16, 'readonly', 'none');
  this.updateFlip(false, false);
}

resize.prototype.kernel = resizeKernel;
resize.prototype.getKernelName = function() { return this.name; }
resize.prototype.getKernelParams = async function(params) {
  if (!((this.flipH === params.flipH) && (this.flipV === params.flipV)))
    await this.updateFlip(params.flipH, params.flipV);

  if (params.scale && !(params.scale > 0.0))
    throw('resize scale factor must be greater than zero');

  if (params.offsetX && !((params.offsetX >= -1.0) && (params.offsetX <= 1.0)))
    throw('resize offsetX must be between -1.0 and +1.0');

  if (params.offsetY && !((params.offsetY >= -1.0) && (params.offsetY <= 1.0)))
    throw('resize offsetX must be between -1.0 and +1.0');

  return {
    input: params.input,
    scale: params.scale || 1.0,
    offsetX: params.offsetX || 0.0,
    offsetY: params.offsetY || 0.0,
    flip: this.flipVals,
    output: params.output,
  }
}

module.exports = resize;
