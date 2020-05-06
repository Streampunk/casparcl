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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const packer_1 = __importDefault(require("./packer"));
const colourMaths_1 = require("./colourMaths");
class Loader extends packer_1.default {
    constructor(clContext, colSpec, outColSpec, packImpl) {
        super(clContext, packImpl);
        this.colMatrixArray = null;
        this.gammaLut = null;
        this.colMatrix = null;
        this.gamutMatrix = null;
        this.gammaArray = colourMaths_1.gamma2linearLUT(colSpec);
        if (!this.packImpl.getIsRGB()) {
            const colMatrix2d = colourMaths_1.ycbcr2rgbMatrix(colSpec, this.packImpl.numBits, this.packImpl.lumaBlack, this.packImpl.lumaWhite, this.packImpl.chromaRange);
            this.colMatrixArray = colourMaths_1.matrixFlatten(colMatrix2d);
        }
        const gamutMatrix2d = colourMaths_1.rgb2rgbMatrix(colSpec, outColSpec);
        this.gamutMatrixArray = colourMaths_1.matrixFlatten(gamutMatrix2d);
    }
    async init() {
        await super.init();
        this.gammaLut = await this.clContext.createBuffer(this.gammaArray.byteLength, 'readonly', 'coarse');
        await this.gammaLut.hostAccess('writeonly');
        Buffer.from(this.gammaArray.buffer).copy(this.gammaLut);
        if (this.colMatrixArray) {
            this.colMatrix = await this.clContext.createBuffer(this.colMatrixArray.byteLength, 'readonly', 'none');
            await this.colMatrix.hostAccess('writeonly');
            Buffer.from(this.colMatrixArray.buffer).copy(this.colMatrix);
        }
        this.gamutMatrix = await this.clContext.createBuffer(this.gamutMatrixArray.byteLength, 'readonly', 'none');
        await this.gamutMatrix.hostAccess('writeonly');
        Buffer.from(this.gamutMatrixArray.buffer).copy(this.gamutMatrix);
    }
    async run(params, queueNum) {
        if (this.program === null)
            throw new Error('Loader.run failed with no program available');
        const kernelParams = this.packImpl.getKernelParams(params);
        kernelParams.gammaLut = this.gammaLut;
        kernelParams.gamutMatrix = this.gamutMatrix;
        if (this.colMatrix)
            kernelParams.colMatrix = this.colMatrix;
        return this.clContext.runProgram(this.program, kernelParams, queueNum);
    }
}
exports.Loader = Loader;
class Saver extends packer_1.default {
    constructor(clContext, colSpec, packImpl) {
        super(clContext, packImpl);
        this.colMatrixArray = null;
        this.gammaLut = null;
        this.colMatrix = null;
        this.gammaArray = colourMaths_1.linear2gammaLUT(colSpec);
        if (!this.packImpl.getIsRGB()) {
            const colMatrix2d = colourMaths_1.rgb2ycbcrMatrix(colSpec, this.packImpl.numBits, this.packImpl.lumaBlack, this.packImpl.lumaWhite, this.packImpl.chromaRange);
            this.colMatrixArray = colourMaths_1.matrixFlatten(colMatrix2d);
        }
    }
    async init() {
        await super.init();
        this.gammaLut = await this.clContext.createBuffer(this.gammaArray.byteLength, 'readonly', 'coarse');
        await this.gammaLut.hostAccess('writeonly');
        Buffer.from(this.gammaArray.buffer).copy(this.gammaLut);
        if (this.colMatrixArray) {
            this.colMatrix = await this.clContext.createBuffer(this.colMatrixArray.byteLength, 'readonly', 'none');
            await this.colMatrix.hostAccess('writeonly');
            Buffer.from(this.colMatrixArray.buffer).copy(this.colMatrix);
        }
    }
    async run(params, queueNum) {
        if (this.program === null)
            throw new Error('Saver.run failed with no program available');
        const kernelParams = this.packImpl.getKernelParams(params);
        kernelParams.gammaLut = this.gammaLut;
        if (this.colMatrix)
            kernelParams.colMatrix = this.colMatrix;
        return this.clContext.runProgram(this.program, kernelParams, queueNum);
    }
}
exports.Saver = Saver;
