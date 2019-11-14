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

const wipeKernel = `
  __constant sampler_t sampler1 =
      CLK_NORMALIZED_COORDS_FALSE
    | CLK_ADDRESS_CLAMP_TO_EDGE
    | CLK_FILTER_NEAREST;

  __kernel void wipe(
    __read_only image2d_t input0,
    __read_only image2d_t input1,
    __private float wipe,
    __write_only image2d_t output) {

    int w = get_image_width(output);
    int h = get_image_height(output);
  
    int x = get_global_id(0);
    int y = get_global_id(1);
    float4 in0 = read_imagef(input0, sampler1, (int2)(x,y));
    float4 in1 = read_imagef(input1, sampler1, (int2)(x,y));

    float4 out = x > w * wipe ? in1 : in0;

    write_imagef(output, (int2)(x, y), out);
  };
`;

function wipe(params) {
  this.name = 'wipe';
  return this;
}

wipe.prototype.init = async function(context) {}
wipe.prototype.kernel = wipeKernel;
wipe.prototype.getKernelName = function() { return this.name; }
wipe.prototype.getKernelParams = async function(params) {
  return {
    input0: params.input0,
    input1: params.input1,
    wipe: params.wipe,
    output: params.output,
  }
}

module.exports = wipe;
