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
const imageProcess_1 = require("./imageProcess");
const mixKernel = `
  __constant sampler_t sampler1 =
      CLK_NORMALIZED_COORDS_FALSE
    | CLK_ADDRESS_CLAMP_TO_EDGE
    | CLK_FILTER_NEAREST;

  __kernel void mixer(
    __read_only image2d_t input0,
    __read_only image2d_t input1,
    __private float mix,
    __write_only image2d_t output) {

    int x = get_global_id(0);
    int y = get_global_id(1);
    float4 in0 = read_imagef(input0, sampler1, (int2)(x,y));
    float4 in1 = read_imagef(input1, sampler1, (int2)(x,y));

    float rmix = 1.0f - mix;
    float4 out = fma(in0, mix, in1 * rmix);

    write_imagef(output, (int2)(x, y), out);
  };
`;
class Mix extends imageProcess_1.ProcessImpl {
    constructor(width, height) {
        super('mixer', width, height, mixKernel, 'mixer');
    }
    async init() {
        return Promise.resolve();
    }
    async getKernelParams(params) {
        return Promise.resolve({
            input0: params.input0,
            input1: params.input1,
            mix: params.mix,
            output: params.output
        });
    }
}
exports.default = Mix;
