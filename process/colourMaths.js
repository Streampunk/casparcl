/* Copyright 2018 Streampunk Media Ltd.

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

const colParams = {
  '601-625': { // https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.601-7-201103-I!!PDF-E.pdf
    kR: 0.299, kB: 0.114,
    rx: 0.640, ry: 0.330,
    gx: 0.290, gy: 0.600,
    bx: 0.150, by: 0.060,
    wx: 0.3127, wy: 0.3290,
    alpha: 1.099,
    beta: 0.018,
    gamma: 0.45,
    delta: 4.5
  },
  '601_525': { // https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.601-7-201103-I!!PDF-E.pdf
    kR: 0.299, kB: 0.114,
    rx: 0.630, ry: 0.340,
    gx: 0.310, gy: 0.595,
    bx: 0.155, by: 0.070,
    wx: 0.3127, wy: 0.3290,
    alpha: 1.099,
    beta: 0.018,
    gamma: 0.45,
    delta: 4.5
  },
  '709': { // https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.709-6-201506-I!!PDF-E.pdf
    kR: 0.2126, kB: 0.0722,
    rx: 0.640, ry: 0.330,
    gx: 0.300, gy: 0.600,
    bx: 0.150, by: 0.060,
    wx: 0.3127, wy: 0.3290,
    alpha: 1.099,
    beta: 0.018,
    gamma: 0.45,
    delta: 4.5
  },
  '2020': { // https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.2020-2-201510-I!!PDF-E.pdf
    kR: 0.2627, kB: 0.0593,
    rx: 0.708, ry: 0.292,
    gx: 0.170, gy: 0.797,
    bx: 0.131, by: 0.046,
    wx: 0.3127, wy: 0.3290,
    alpha: 1.099,
    beta: 0.018,
    gamma: 0.45,
    delta: 4.5
  },
  'sRGB': { // https://en.wikipedia.org/wiki/SRGB
    kR: 0.0, kB: 0.0,
    rx: 0.640, ry: 0.330,
    gx: 0.300, gy: 0.600,
    bx: 0.150, by: 0.060,
    wx: 0.3127, wy: 0.3290,
    alpha: 1.055,
    beta: 0.0031308,
    gamma: 1.0 / 2.4,
    delta: 12.92
  }
};

function gamma2linearLUT(colSpec) {
  if (!(colSpec in colParams)) {
    console.error(`Unrecognised colourspace ${colSpec} - defaulting to BT.709`);
    colSpec = '709';
  }
  const alpha = colParams[colSpec].alpha;
  const delta = colParams[colSpec].delta;
  const beta = colParams[colSpec].beta * delta;
  const gamma = colParams[colSpec].gamma;
  const numEntries = 2**16;
  const lutArr = new Float32Array(numEntries);
  lutArr.fill(1.0);

  for (let i=0; i<numEntries; ++i) {
    const fi = i / (numEntries-1);
    if (fi < beta)
      lutArr[i] = fi / delta;
    else
      lutArr[i] = ((fi + (alpha-1)) / alpha)**(1/gamma);
  }
  return lutArr;
}

function linear2gammaLUT(colSpec) {
  if (!(colSpec in colParams)) {
    console.error(`Unrecognised colourspace ${colSpec} - defaulting to BT.709`);
    colSpec = '709';
  }
  const alpha = colParams[colSpec].alpha;
  const beta = colParams[colSpec].beta;
  const gamma = colParams[colSpec].gamma;
  const delta = colParams[colSpec].delta;
  const numEntries = 2**16;
  const lutArr = new Float32Array(numEntries);
  lutArr.fill(1.0);
  for (let i=0; i<numEntries; ++i) {
    const fi = i / (numEntries-1);
    if (fi < beta)
      lutArr[i] = fi * delta;
    else
      lutArr[i] = alpha * (fi**gamma) - (alpha-1);
  }
  return lutArr;
}

function ycbcr2rgbMatrix(colSpec, numBits, lumaBlack, lumaWhite, chrRange) {
  if (!(colSpec in colParams)) {
    console.error(`Unrecognised colourspace ${colSpec} - defaulting to BT.709`);
    colSpec = '709';
  }
  const chrNull = 128.0 << (numBits - 8);
  const lumaRange = lumaWhite - lumaBlack;

  const kR = colParams[colSpec].kR;
  const kB = colParams[colSpec].kB;
  const kG = 1.0 - kR - kB;

  const Yr = 1.0;
  const Ur = 0.0;
  const Vr = 1.0 - kR;

  const Yg = 1.0;
  const Ug = - (1.0 - kB) * kB / kG;
  const Vg = - (1.0 - kR) * kR / kG;

  const Yb = 1.0;
  const Ub = 1.0 - kB;
  const Vb = 0.0;

  const colMatrix = [...new Array(3)].map(() => new Float32Array(3));
  colMatrix[0] = Float32Array.from([Yr, Ur, Vr]);
  colMatrix[1] = Float32Array.from([Yg, Ug, Vg]);
  colMatrix[2] = Float32Array.from([Yb, Ub, Vb]);

  const Yy = 1.0 / lumaRange;
  const Uy = 0.0;
  const Vy = 0.0;
  const Oy = - lumaBlack / lumaRange;

  const Yu = 0.0;
  const Uu = (1.0 / chrRange) * 2;
  const Vu = 0.0;
  const Ou = - (chrNull / chrRange) * 2;

  const Yv = 0.0;
  const Uv = 0.0;
  const Vv = (1.0 / chrRange) * 2;
  const Ov = - (chrNull / chrRange) * 2;

  const scaleMatrix = [...new Array(3)].map(() => new Float32Array(4));
  scaleMatrix[0] = Float32Array.from([Yy, Uy, Vy, Oy]);
  scaleMatrix[1] = Float32Array.from([Yu, Uu, Vu, Ou]);
  scaleMatrix[2] = Float32Array.from([Yv, Uv, Vv, Ov]);

  return matrixMultiply(colMatrix, scaleMatrix);
}

function rgb2ycbcrMatrix(colSpec, numBits, lumaBlack, lumaWhite, chrRange) {
  if (!(colSpec in colParams)) {
    console.error(`Unrecognised colourspace ${colSpec} - defaulting to BT.709`);
    colSpec = '709';
  }
  const chrNull = 128.0 << (numBits - 8);
  const lumaRange = lumaWhite - lumaBlack;

  const kR = colParams[colSpec].kR;
  const kB = colParams[colSpec].kB;
  const kG = 1.0 - kR - kB;

  const Yy = lumaRange;
  const Uy = 0.0;
  const Vy = 0.0;

  const Yu = 0.0;
  const Uu = chrRange / 2.0;
  const Vu = 0.0;

  const Yv = 0.0;
  const Uv = 0.0;
  const Vv = chrRange / 2.0;

  const scaleMatrix = [...new Array(3)].map(() => new Float32Array(3));
  scaleMatrix[0] = Float32Array.from([Yy, Uy, Vy]);
  scaleMatrix[1] = Float32Array.from([Yu, Uu, Vu]);
  scaleMatrix[2] = Float32Array.from([Yv, Uv, Vv]);

  const Ry = kR;
  const Gy = kG;
  const By = kB;
  const Oy = lumaBlack / lumaRange;

  const Ru = - kR / (1.0 - kB);
  const Gu = - kG / (1.0 - kB);
  const Bu = (1.0 - kB) / (1.0 - kB);
  const Ou = (chrNull / chrRange) * 2.0;

  const Rv = (1.0 - kR) / (1.0 - kR);
  const Gv = - kG / (1.0 - kR);
  const Bv = - kB / (1.0 - kR);
  const Ov = (chrNull / chrRange) * 2.0;

  const colMatrix = [...new Array(3)].map(() => new Float32Array(4));
  colMatrix[0] = Float32Array.from([Ry, Gy, By, Oy]);
  colMatrix[1] = Float32Array.from([Ru, Gu, Bu, Ou]);
  colMatrix[2] = Float32Array.from([Rv, Gv, Bv, Ov]);

  return matrixMultiply(scaleMatrix, colMatrix);
}

function rgb2rgbMatrix(srcColSpec, dstColSpec) {
  return matrixMultiply(xyz2rgbMatrix(dstColSpec), rgb2xyzMatrix(srcColSpec));
}

function rgb2xyzMatrix(colSpec) {
  if (!(colSpec in colParams)) {
    console.error(`Unrecognised colourspace ${colSpec} - defaulting to BT.709`);
    colSpec = '709';
  }
  const w = [...new Array(3)].map(() => new Float32Array(1));
  w[0] = Float32Array.from([colParams[colSpec].wx]);
  w[1] = Float32Array.from([colParams[colSpec].wy]);
  w[2] = Float32Array.from([1.0 - colParams[colSpec].wx - colParams[colSpec].wy]);
  const W = scalarMultiply(w, 1.0 / w[1][0]);

  const xyz = [...new Array(3)].map(() => new Float32Array(3));
  xyz[0] = Float32Array.from([colParams[colSpec].rx, colParams[colSpec].gx, colParams[colSpec].bx]);
  xyz[1] = Float32Array.from([colParams[colSpec].ry, colParams[colSpec].gy, colParams[colSpec].by]);
  xyz[2] = Float32Array.from([
    1.0 - colParams[colSpec].rx - colParams[colSpec].ry,
    1.0 - colParams[colSpec].gx - colParams[colSpec].gy,
    1.0 - colParams[colSpec].bx - colParams[colSpec].by
  ]);
  const xyzScaleFactors = matrixMultiply(matrixInvert3x3(xyz), W);
  const xyzScale = [...new Array(3)].map(() => new Float32Array(3));
  xyzScale[0][0] = xyzScaleFactors[0][0];
  xyzScale[1][1] = xyzScaleFactors[1][0];
  xyzScale[2][2] = xyzScaleFactors[2][0];

  return matrixMultiply(xyz, xyzScale);
}

function xyz2rgbMatrix(colSpec) {
  if (!(colSpec in colParams)) {
    console.error(`Unrecognised colourspace ${colSpec} - defaulting to BT.709`);
    colSpec = '709';
  }
  return matrixInvert3x3(rgb2xyzMatrix(colSpec));
}

function scalarMultiply (a, c) {
  let result = [...new Float32Array(a.length)].map(() => new Float32Array(a[0].length));
  return result.map((row, i) => {
    return row.map((val, j) => {
      return a[i][j] * c;
    });
  });
}

function matrixMultiply (a, b) {
  let result = [...new Float32Array(a.length)].map(() => new Float32Array(b[0].length));
  return result.map((row, i) => {
    return row.map((val, j) => {
      return a[i].reduce((sum, elm, k) => sum + (elm*b[k][j]), 0.0);
    });
  });
}

function matrixTranspose(a) {
  return Object.keys(a[0]).map(c => 
    a.map(r => r[c])
  );
}

function matrixDeterminant2x2(a) {
  if ((a.length != a[0].length) || (2 !== a.length))
    throw ('matrixDeterminant2x2 requires a 2 x 2 matrix');
  return a[0][0] * a[1][1] - a[0][1] * a[1][0];
}

function matrixOfMinors3x3(a) {
  if ((a.length != a[0].length) || (3 !== a.length))
    throw ('matrixOfMinors3x3 requires a 3 x 3 matrix');

  let result = [...new Float32Array(a.length)].map(()=> new Float32Array(a.length));
  return result.map((row, i) => {
    return row.map((val, j) => {
      let minor = [...new Float32Array(a.length-1)].map(() => new Float32Array(a.length-1));
      const y = (1==i)?[i-1, i+1]:[(i+1)%3, (i+2)%3];
      const x = (1==j)?[j-1, j+1]:[(j+1)%3, (j+2)%3];
      minor.forEach((arr, r) => arr.forEach((val, c) => minor[r][c] = a[y[r]][x[c]]));
      return matrixDeterminant2x2(minor);
    });    
  });    
}
function matrixOfCofactors3x3(a) {
  if ((a.length != a[0].length) || (3 !== a.length))
    throw ('matrixOfCofactors3x3 requires a 3 x 3 matrix');

  let result = [...new Float32Array(a.length)].map(() => new Float32Array(a.length));
  return result.map((row, i) => {
    return row.map((val, j) => {
      return a[i][j] * Math.pow(-1, i+j);
    });    
  });    
}

function matrixInvert3x3(a) {
  if ((a.length != a[0].length) || (3 !== a.length))
    throw ('matrixInvert3x3 requires a 3 x 3 matrix');
  const minors = matrixOfMinors3x3(a);
  const cofactors = matrixOfCofactors3x3(minors);
  const adjugate = matrixTranspose(cofactors);
  const determinant = a[0][0] * minors[0][0] - a[0][1] * minors[0][1] + a[0][2] * minors[0][2];
  return scalarMultiply(adjugate, 1.0 / determinant);
}

function matrixFlatten(a) {
  let result = new Float32Array(a.length * a[0].length);
  return result.map((row, i) => {
    return a[(i/a[0].length)>>>0][i%a[0].length];
  });
}

module.exports = {
  ycbcr2rgbMatrix: ycbcr2rgbMatrix,
  rgb2ycbcrMatrix: rgb2ycbcrMatrix,

  gamma2linearLUT: gamma2linearLUT,
  linear2gammaLUT: linear2gammaLUT,

  rgb2rgbMatrix: rgb2rgbMatrix,

  matrixFlatten: matrixFlatten
};