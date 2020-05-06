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
const imageProcess_1 = __importDefault(require("./imageProcess"));
const transform_1 = __importDefault(require("./transform"));
const mix_1 = __importDefault(require("./mix"));
const wipe_1 = __importDefault(require("./wipe"));
const combine_1 = __importDefault(require("./combine"));
class Switch {
    constructor(clContext, width, height, numInputs, numOverlays) {
        this.xform0 = null;
        this.xform1 = null;
        this.rgbaXf0 = null;
        this.rgbaXf1 = null;
        this.rgbaMx = null;
        this.mixer = null;
        this.wiper = null;
        this.combiner = null;
        this.clContext = clContext;
        this.width = width;
        this.height = height;
        this.numInputs = numInputs;
        this.numOverlays = numOverlays;
    }
    async init() {
        const numBytesRGBA = this.width * this.height * 4 * 4;
        this.xform0 = new imageProcess_1.default(this.clContext, new transform_1.default(this.clContext, this.width, this.height));
        await this.xform0.init();
        this.rgbaXf0 = await this.clContext.createBuffer(numBytesRGBA, 'readwrite', 'coarse', {
            width: this.width,
            height: this.height
        }, 'switch');
        if (this.numInputs > 1) {
            this.xform1 = new imageProcess_1.default(this.clContext, new transform_1.default(this.clContext, this.width, this.height));
            await this.xform1.init();
            this.rgbaXf1 = await this.clContext.createBuffer(numBytesRGBA, 'readwrite', 'coarse', {
                width: this.width,
                height: this.height
            }, 'switch');
            this.mixer = new imageProcess_1.default(this.clContext, new mix_1.default(this.width, this.height));
            await this.mixer.init();
            this.wiper = new imageProcess_1.default(this.clContext, new wipe_1.default(this.width, this.height));
            await this.wiper.init();
        }
        this.combiner = new imageProcess_1.default(this.clContext, new combine_1.default(this.width, this.height, this.numOverlays));
        await this.combiner.init();
        this.rgbaMx = await this.clContext.createBuffer(numBytesRGBA, 'readwrite', 'coarse', {
            width: this.width,
            height: this.height
        }, 'switch');
    }
    async processFrame(inParams, mixParams, overlays, output, clQueue) {
        if (!(this.xform0 && this.xform1 && this.mixer && this.wiper && this.combiner))
            throw new Error('Switch needs to be initialised');
        inParams[0].output = this.rgbaXf0;
        await this.xform0.run(inParams[0], clQueue);
        if (this.numInputs > 1) {
            inParams[1].output = this.rgbaXf1;
            await this.xform1.run(inParams[1], clQueue);
            if (mixParams.wipe) {
                /*mixParams.frac*/
                await this.wiper.run({ input0: this.rgbaXf0, input1: this.rgbaXf1, wipe: mixParams.frac, output: this.rgbaMx }, clQueue);
            }
            else {
                await this.mixer.run({ input0: this.rgbaXf0, input1: this.rgbaXf1, mix: mixParams.frac, output: this.rgbaMx }, clQueue);
            }
        }
        return await this.combiner.run({ bgIn: this.rgbaMx, ovIn: overlays, output: output }, clQueue);
    }
}
exports.default = Switch;
