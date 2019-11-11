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

const combineKernel = `
  __constant sampler_t sampler1 =
      CLK_NORMALIZED_COORDS_FALSE
    | CLK_ADDRESS_CLAMP_TO_EDGE
    | CLK_FILTER_NEAREST;

  __kernel void
    twoInputs(__read_only image2d_t bgIn,
              __read_only image2d_t ovIn,
              __write_only image2d_t output) {

    int x = get_global_id(0);
    int y = get_global_id(1);
    float4 bg = read_imagef(bgIn, sampler1, (int2)(x,y));
    float4 ov = read_imagef(ovIn, sampler1, (int2)(x,y));
    float k = 1.0f - ov.s3;
    float4 k4 = (float4)(k, k, k, 0.0f);
    float4 out = fma(bg, k4, ov);
    write_imagef(output, (int2)(x, y), out);
  };

  __kernel void
    threeInputs(__read_only image2d_t bgIn,
                __read_only image2d_t ov0In,
                __read_only image2d_t ov1In,
                __write_only image2d_t output) {

    int x = get_global_id(0);
    int y = get_global_id(1);
    float4 bg = read_imagef(bgIn, sampler1, (int2)(x,y));

    float4 ov0 = read_imagef(ov0In, sampler1, (int2)(x,y));
    float k = 1.0f - ov0.s3;
    float4 k4 = (float4)(k, k, k, 0.0f);
    float4 out0 = fma(bg, k4, ov0);

    float4 ov1 = read_imagef(ov1In, sampler1, (int2)(x,y));
    k = 1.0f - ov1.s3;
    k4 = (float4)(k, k, k, 0.0f);
    float4 out1 = fma(out0, k4, ov1);
    write_imagef(output, (int2)(x, y), out1);
  };
`;

function combine(params) {
  this.numInputs = params.numInputs;
  if (!(this.numInputs && (this.numInputs > 1) && (this.numInputs < 4)))
    throw('combiner needs a numInputs property - two or three inputs currently supported');

  switch (this.numInputs) {
    case 2: this.name = 'twoInputs'; break;
    case 3: this.name = 'threeInputs'; break;
  }
  return this;
}

combine.prototype.kernel = combineKernel;
combine.prototype.getKernelName = function() { return this.name; }
combine.prototype.getKernelParams = function(params) {
  let kernelParams = {
    bgIn: params.bgIn,
    output: params.output,
  };

  switch (this.numInputs) {
    case 2:
      kernelParams.ovIn = params.ovIn;
      break;
    case 3:
      kernelParams.ov0In = params.ovIn[0];
      kernelParams.ov1In = params.ovIn[1];
      break;
  }
  return kernelParams;
}

module.exports = combine;
