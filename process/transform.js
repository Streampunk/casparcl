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

const colMaths = require('./colourMaths.js');

const transformKernel = `
  __constant sampler_t samplerIn =
    CLK_NORMALIZED_COORDS_TRUE |
    CLK_ADDRESS_CLAMP |
    CLK_FILTER_LINEAR;

  __constant sampler_t samplerOut =
    CLK_NORMALIZED_COORDS_FALSE |
    CLK_ADDRESS_CLAMP |
    CLK_FILTER_NEAREST;

  __kernel void transform(
    __read_only image2d_t input,
    __global float4* restrict transformMatrix,
    __write_only image2d_t output) {

    int w = get_image_width(output);
    int h = get_image_height(output);

    // Load two rows of the 3x3 transform matrix via two float4s
    float4 tmpMat0 = transformMatrix[0];
    float4 tmpMat1 = transformMatrix[1];
    float3 mat0 = (float3)(tmpMat0.s0, tmpMat0.s1, tmpMat0.s2);
    float3 mat1 = (float3)(tmpMat0.s3, tmpMat1.s0, tmpMat1.s1);

    int outX = get_global_id(0);
    int outY = get_global_id(1);
    int2 posOut = {outX, outY};

    float3 inPos = (float3)(outX / (float) w - 0.5f, outY / (float) h - 0.5f, 1.0f);
    float2 posIn = (float2)(dot(mat0, inPos) + 0.5f, dot(mat1, inPos) + 0.5f);

    float4 in = read_imagef(input, samplerIn, posIn);
    write_imagef(output, posOut, in);
  }
`;

function transform(params) {
  this.name = 'transform';
  this.width = params.width;
  this.height = params.height;
  this.transformMatrix = [...new Array(3)].map(() => new Float32Array(3));
  this.transformMatrix[0] = Float32Array.from([1.0, 0.0, 0.0]);
  this.transformMatrix[1] = Float32Array.from([0.0, 1.0, 0.0]);
  this.transformMatrix[2] = Float32Array.from([0.0, 0.0, 1.0]);
  this.transformArray = colMaths.matrixFlatten(this.transformMatrix);
  return this;
}

transform.prototype.updateMatrix = async function(clQueue) {
  this.transformArray = colMaths.matrixFlatten(this.transformMatrix);
  await this.matrixBuffer.hostAccess('writeonly', clQueue, Buffer.from(this.transformArray.buffer));
  return this.matrixBuffer.hostAccess('none', clQueue);
}

transform.prototype.init = async function(context) {
  this.matrixBuffer = await context.createBuffer(this.transformArray.byteLength, 'readonly', 'coarse');
  return this.updateMatrix(context.queue.load);
}

transform.prototype.kernel = transformKernel;
transform.prototype.getKernelName = function() { return this.name; }
transform.prototype.getKernelParams = async function(params, clQueue) {
  const aspect = this.width / this.height;
  const flipX = (params.flipH || false) ? -1.0 : 1.0;
  const flipY = (params.flipV || false) ? -1.0 : 1.0;
  const scaleX = (params.scale || 1.0) * flipX * aspect;
  const scaleY = (params.scale || 1.0) * flipY;
  const offsetX = params.offsetX || 0.0;
  const offsetY = params.offsetY || 0.0;
  const rotate = params.rotate || 0.0;

  let scaleMatrix = [...new Array(3)].map(() => new Float32Array(3));
  scaleMatrix[0] = Float32Array.from([1.0 / scaleX, 0.0, 0.0]);
  scaleMatrix[1] = Float32Array.from([0.0, 1.0 / scaleY, 0.0]);
  scaleMatrix[2] = Float32Array.from([0.0, 0.0, 1.0]);

  let translateMatrix = [...new Array(3)].map(() => new Float32Array(3));
  translateMatrix[0] = Float32Array.from([1.0, 0.0, offsetX]);
  translateMatrix[1] = Float32Array.from([0.0, 1.0, offsetY]);
  translateMatrix[2] = Float32Array.from([0.0, 0.0, 1.0]);

  let rotateMatrix = [...new Array(3)].map(() => new Float32Array(3));
  rotateMatrix[0] = Float32Array.from([Math.cos(rotate), -Math.sin(rotate), 0.0]);
  rotateMatrix[1] = Float32Array.from([Math.sin(rotate), Math.cos(rotate), 0.0]);
  rotateMatrix[2] = Float32Array.from([0.0, 0.0, 1.0]);

  let projectMatrix = [...new Array(3)].map(() => new Float32Array(3));
  projectMatrix[0] = Float32Array.from([aspect, 0.0, 0.0]);
  projectMatrix[1] = Float32Array.from([0.0, 1.0, 0.0]);
  projectMatrix[2] = Float32Array.from([0.0, 0.0, 1.0]);

  this.transformMatrix =
    colMaths.matrixMultiply(
      colMaths.matrixMultiply(
        colMaths.matrixMultiply(
          scaleMatrix, translateMatrix), rotateMatrix), projectMatrix);

  await this.updateMatrix(clQueue);
  return {
    input: params.input,
    transformMatrix: this.matrixBuffer,
    output: params.output,
  }
}

module.exports = transform;
