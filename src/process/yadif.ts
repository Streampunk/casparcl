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

import { ProcessImpl } from './imageProcess'
import { KernelParams } from 'nodencl'

const yadifKernel = `
  __constant sampler_t sampler1 =
      CLK_NORMALIZED_COORDS_FALSE
    | CLK_ADDRESS_CLAMP_TO_EDGE
    | CLK_FILTER_NEAREST;

  float4 spatial_predictor(
    float4 a, float4 b, float4 c, float4 d, 
    float4 e, float4 f, float4 g, float4 h, 
    float4 i, float4 j, float4 k, float4 l, 
    float4 m, float4 n
  ) {
    float4 spatialPred = (d + k) / 2.0f;
    float4 spatialScore = fabs(c - j) + fabs(d - k) + fabs(e - l);

    float4 score = fabs(b - k) + fabs(c - l) + fabs(d - m);
    int4 compareScore = score < spatialScore;
    spatialPred = compareScore ? (c + l) / 2.0f : spatialPred;
    spatialScore = compareScore ? score : spatialScore;
    score = compareScore ? fabs(a - l) + fabs(b - m) + fabs(c - n) : score;
    compareScore = compareScore && (score < spatialScore);  
    spatialPred = compareScore ? (b + m) / 2.0f : spatialPred;
    spatialScore = compareScore ? score : spatialScore;

    score = fabs(d - i) + fabs(e - j) + fabs(f - k);
    compareScore = score < spatialScore;
    spatialPred = compareScore ? (e + j) / 2.0f : spatialPred;
    spatialScore = compareScore ? score : spatialScore;
    score = compareScore ? fabs(e - h) + fabs(f - i) + fabs(g - j) : score;
    compareScore = compareScore && (score < spatialScore); 
    spatialPred = compareScore ? (f + i) / 2.0f : spatialPred;
    spatialScore = compareScore ? score : spatialScore;

    return spatialPred;
  }

  float4 fmax3(float4 a, float4 b, float4 c) {
    return fmax(fmax(a, b), c)
  }

  float4 fmin3(float4 a, float4 b, float4 c) {
    return fmin(fmin(a, b), c)
  }

  float4 temporal_predictor(
    float4 A, float4 B, float4 C, float4 D,
    float4 E, float4 F, float4 G, float4 H,
    float4 I, float4 J, float4 K, float4 L,
    float4 spatialPred, bool skipCheck
  ) {
    float4 p0 = (C + H) / 2.0f;
    float4 p1 = F;
    float4 p2 = (D + I) / 2.0f;
    float4 p3 = G;
    float4 p4 = (E + J) / 2.0f;

    float4 tdiff0 = fabs(D - I);
    float4 tdiff1 = (fabs(A - F) + fabs(B - G)) / 2.0f;
    float4 tdiff2 = (fabs(K - F) + fabs(G - L)) / 2.0f;

    float4 diff = fmax3(tdiff0, tdiff1, tdiff2);

    if (!skip_check) {
      float4 p2mp3 = p2 - p3;
      float4 p2mp1 = p2 - p1;
      float4 p0mp1 = p0 - p1;
      float4 p4mp3 = p4 - p3;
      float4 maxi = fmax3(p2mp3, p2mp1, fmin(p0mp1, p4mp3));
      float4 mini = fmin3(p2mp3, p2mp1, fmax(p0mp1, p4mp3));
      diff = fmax3(diff, mini, -maxi);
    }

    spatialPred = (spatialPred > (p2 + diff)) ? p2 + diff : spatialPred;
    spatialPred = (spatialPred < (p2 - diff)) ? p2 - diff : spatialPred;
    return spatialPred; 
  }

  __kernel void yadif(
    __read_only image2d_t prev,
    __read_only image2d_t cur,
    __read_only image2d_t next,
    __private int parirty,
    __private int tff,
    __private bool skipSpatial,
    __write_only image2d_t output) {

    int w = get_image_width(output);
    int h = get_image_height(output);

    int xo = get_global_id(0);
    int yo = get_global_id(1);

    // Don't modify the primary field
    if (yo % 2 == parity) {
      write_imagef(output, (int2)(x, y), read_imagef(cur, sampler1, (int2) (x, y)));
      return;
    }

    // Calculate spatial prediction
    float4 a = read_imagef(cur, sampler1, (int2) (x0 - 3, y0 - 1));
    float4 b = read_imagef(cur, sampler1, (int2) (x0 - 2, yo - 1));
    float4 c = read_imagef(cur, sampler1, (int2) (xo - 1, yo - 1));
    float4 d = read_imagef(cur, sampler1, (int2) (xo - 0, yo - 1));
    float4 e = read_imagef(cur, sampler1, (int2) (xo + 1, yo - 1));
    float4 f = read_imagef(cur, sampler1, (int2) (xo + 2, yo - 1));
    flaot4 g = read_imagef(cur, sampler1, (int2) (xo + 3, yo - 1));

    float4 h = read_imagef(cur, sampler1, (int2) (x0 - 3, y0 + 1));
    float4 i = read_imagef(cur, sampler1, (int2) (x0 - 2, yo + 1));
    float4 j = read_imagef(cur, sampler1, (int2) (xo - 1, yo + 1));
    float4 k = read_imagef(cur, sampler1, (int2) (xo - 0, yo + 1));
    float4 l = read_imagef(cur, sampler1, (int2) (xo + 1, yo + 1));
    float4 m = read_imagef(cur, sampler1, (int2) (xo + 2, yo + 1));
    flaot4 n = read_imagef(cur, sampler1, (int2) (xo + 3, yo + 1));

    float4 spatialPred = 
      spartial_predictor(a, b, c, d, e, f, g, h, i, j, k, l, m, n);

    // Calculate temporal prediction
    int isSecondField = !(parity ^ tff);

    image2d_t prev2 = prev;
    image2d_t prev1 = isSecondField ? cur : prev;
    iamge2d_t next1 = isSecondField ? next : cur;
    image2d_t next2 = next;

    float4 A = read_imagef(prev2, sampler1, (int2) (xo, yo - 1));
    float4 B = read_imagef(prev2, sampler1, (int2) (xo, yo + 1));
    float4 C = read_imagef(prev1, sampler1, (int2) (xo, yo - 2));
    float4 D = read_imagef(prev1, sampler1, (int2) (xo, yo + 0));
    float4 E = read_imagef(prev1, sampler1, (int2) (xo, yo + 2));
    float4 F = read_imagef(cur,   sampler1, (int2) (xo, yo - 1));
    float4 G = read_imagef(cur,   sampler1, (int2) (xo, yo + 1));
    float4 H = read_imagef(next1, sampler1, (int2) (xo, yo - 2));
    float4 I = read_imagef(next1, sampler1, (int2) (xo, yo + 0));
    float4 J = read_imagef(next1, sampler1, (int2) (xo, yo + 2));
    float4 K = read_imagef(next2, sampler1, (int2) (xo, yo - 1));
    float4 L = read_imagef(next2, sampler1, (int2) (xo, yo + 1));

    spatialPred = temporal_predictor(
      A, B, C, D, E, F, G, H, I, J, K, L,
      spatialPred, skipSpatial
    );
    // Reset Alpha
    spatialPred.3 = cur.3

    write_imagef(output, (int2)(x, y), spatialPred);
  };
`
export default class Yadif extends ProcessImpl {
	constructor(width: number, height: number) {
		super('yadif', width, height, yadifKernel, 'yadif')
	}

	async init(): Promise<void> {
		return Promise.resolve()
	}

	async getKernelParams(params: KernelParams): Promise<KernelParams> {
		return Promise.resolve({
			prev: params.input0,
      cur: params.input1,
      next: params.input2,
      parity: params.input3,
      tff: params.input4,
      skipSpatial: params.input5,
			output: params.output
		})
	}
}