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
const loadSave_1 = require("./loadSave");
const imageProcess_1 = __importDefault(require("./imageProcess"));
const resize_1 = __importDefault(require("./resize"));
class ToRGBA {
    constructor(clContext, colSpecRead, colSpecWrite, readImpl) {
        this.clContext = clContext;
        this.loader = new loadSave_1.Loader(this.clContext, colSpecRead, colSpecWrite, readImpl);
        this.numBytes = readImpl.getNumBytes();
        this.numBytesRGBA = readImpl.getNumBytesRGBA();
        this.totalBytes = readImpl.getTotalBytes();
    }
    async init() {
        await this.loader.init();
    }
    getNumBytes() {
        return this.numBytes;
    }
    getNumBytesRGBA() {
        return this.numBytesRGBA;
    }
    getTotalBytes() {
        return this.totalBytes;
    }
    async createSources() {
        return Promise.all(this.numBytes.map((bytes) => this.clContext.createBuffer(bytes, 'readonly', 'coarse', undefined, 'ToRGBA')));
    }
    async createDest(imageDims) {
        return this.clContext.createBuffer(this.numBytesRGBA, 'readonly', 'coarse', imageDims, 'ToRGBA');
    }
    async loadFrame(input, sources, clQueue) {
        const inputs = Array.isArray(input) ? input : [input];
        return Promise.all(sources.map(async (src, i) => {
            await src.hostAccess('writeonly', clQueue ? clQueue : 0, inputs[i].slice(0, this.numBytes[i]));
            return src.hostAccess('none', clQueue ? clQueue : 0);
        }));
    }
    async processFrame(sources, dest, clQueue) {
        return this.loader.run({ sources: sources, dest: dest }, clQueue ? clQueue : 0);
    }
}
exports.ToRGBA = ToRGBA;
class FromRGBA {
    constructor(clContext, colSpecRead, writeImpl, srcWidth, srcHeight) {
        this.resizer = null;
        this.rgbaSz = null;
        this.clContext = clContext;
        this.width = writeImpl.getWidth();
        this.height = writeImpl.getHeight();
        this.saver = new loadSave_1.Saver(this.clContext, colSpecRead, writeImpl);
        this.numBytes = writeImpl.getNumBytes();
        this.numBytesRGBA = writeImpl.getNumBytesRGBA();
        this.totalBytes = writeImpl.getTotalBytes();
        this.srcWidth = srcWidth ? srcWidth : this.width;
        this.srcHeight = srcHeight ? srcHeight : this.height;
    }
    async init() {
        await this.saver.init();
        if (!(this.srcWidth === this.width && this.srcHeight === this.height)) {
            this.resizer = new imageProcess_1.default(this.clContext, new resize_1.default(this.clContext, this.width, this.height));
            await this.resizer.init();
            this.rgbaSz = await this.clContext.createBuffer(this.numBytesRGBA, 'readwrite', 'coarse', { width: this.width, height: this.height }, 'rgbaSz');
        }
    }
    getNumBytes() {
        return this.numBytes;
    }
    getNumBytesRGBA() {
        return this.numBytesRGBA;
    }
    getTotalBytes() {
        return this.totalBytes;
    }
    async createDests() {
        return Promise.all(this.numBytes.map((bytes) => this.clContext.createBuffer(bytes, 'readonly', 'coarse', undefined, 'ToRGBA')));
    }
    async processFrame(source, dests, clQueue, interlace) {
        let saveSource = source;
        if (this.resizer && this.rgbaSz) {
            await this.resizer.run({ input: source, output: this.rgbaSz }, clQueue ? clQueue : 0);
            saveSource = this.rgbaSz;
        }
        return this.saver.run({ source: saveSource, dests: dests, interlace: interlace }, clQueue ? clQueue : 0);
    }
    async saveFrame(output, clQueue) {
        const outputs = Array.isArray(output) ? output : [output];
        return Promise.all(outputs.map((op) => op.hostAccess('readonly', clQueue ? clQueue : 0)));
    }
}
exports.FromRGBA = FromRGBA;
