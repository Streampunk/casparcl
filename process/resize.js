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

  __kernel void resize(__read_only  image2d_t input,
                       __write_only image2d_t output) {
    int w = get_image_width(output);
    int h = get_image_height(output);

    int outX = get_global_id(0);
    int outY = get_global_id(1);
    int2 posOut = {outX, outY};

    float inX = outX / (float) w;
    float inY = outY / (float) h;
    float2 posIn = (float2) (inX, inY);

    float4 in = read_imagef(input, samplerIn, posIn);
    write_imagef(output, posOut, in);
  }
`;

function resize(params) {
  this.name = 'resize';
  return this;
}

resize.prototype.kernel = resizeKernel;
resize.prototype.getKernelName = function() { return this.name; }
resize.prototype.getKernelParams = function(params) {
  return {
    input: params.input,
    output: params.output,
  }
}

module.exports = resize;
